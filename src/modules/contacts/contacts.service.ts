import { Injectable, BadRequestException, ConflictException, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Contact } from './entities/contact.entity';
import { ContactImport } from './entities/contact-import.entity';
import { QueryContactDto } from './dto/query-contact.dto';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { PaginatedResponse } from '../../common/dto/pagination.dto';
import { AuditLogService } from '../audit-log/audit-log.service';
import { Order } from '../orders/entities/order.entity';
import { normalizePhone } from '../orders/order-rules';
import { Conversation } from '../whatsapp/entities/conversation.entity';
import { LoyaltyCard } from '../loyalty/entities/loyalty-card.entity';
import * as Papa from 'papaparse';
import * as XLSX from 'xlsx';

export type ContactSource = Contact['source'];

export interface TimelineEntry {
    at: string;
    kind: 'order' | 'conversation' | 'loyalty';
    title: string;
    /** Solo en pedidos, en céntimos (igual que la API de pedidos). */
    amount?: number;
}

const TIMELINE_MAX = 100;
// Campos que un alta posterior puede completar en un contacto existente (solo si estaban vacíos).
const FILL_KEYS = ['name', 'email', 'dni', 'tags', 'customFields'] as const;
const ORDER_STATUS_LABEL: Record<string, string> = {
    PENDIENTE_PAGO: 'pendiente de pago', NUEVO: 'nuevo', EN_PREPARACION: 'en preparación', LISTO: 'listo', ENTREGADO: 'entregado', CANCELADO: 'cancelado',
};
const CONVERSATION_STATUS_LABEL: Record<string, string> = { abierto: 'abierta', pendiente: 'pendiente', cerrado: 'cerrada' };

const isEmpty = (v: unknown) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
const isUniqueViolation = (err: any) => (err?.code ?? err?.driverError?.code) === '23505';
// El mismo número aparece con o sin prefijo 51 según de dónde venga, así que la ficha cruza por los últimos 9 dígitos.
const lastNine = (phone: string | null | undefined) => (phone ?? '').replace(/\D/g, '').slice(-9);
const samePhone = (column: string) => `right(regexp_replace(coalesce(${column}, ''), '\\D', '', 'g'), 9) = :last9`;

@Injectable()
export class ContactsService {
    private readonly logger = new Logger(ContactsService.name);

    constructor(
        @InjectRepository(Contact)
        private contactRepo: Repository<Contact>,
        @InjectRepository(ContactImport)
        private importRepo: Repository<ContactImport>,
        private auditLogService: AuditLogService,
        @InjectRepository(Order)
        private ordersRepo: Repository<Order>,
        @InjectRepository(Conversation)
        private conversationsRepo: Repository<Conversation>,
        @InjectRepository(LoyaltyCard)
        private cardsRepo: Repository<LoyaltyCard>,
    ) {}

    /**
     * Cliente único: un contacto por (local, teléfono normalizado). Devuelve null si el teléfono no tiene dígitos.
     * El consentimiento de marketing nunca se infiere: nace en false salvo que quien llama lo pase en true
     * (solo la tarjeta de fidelización y las opiniones lo piden de forma explícita) y nunca baja de true a false.
     */
    async upsertByPhone(
        placeId: string,
        phone: string,
        opts: { name?: string; source: ContactSource; marketingConsent?: boolean },
    ): Promise<Contact | null> {
        const normalized = normalizePhone(phone);
        if (!normalized) return null;
        const { contact } = await this.upsert(placeId, normalized, opts.source, opts.marketingConsent === true, { name: opts.name?.trim() || null });
        return contact;
    }

    private async upsert(
        placeId: string,
        phone: string,
        source: ContactSource,
        consent: boolean,
        fields: Partial<Pick<Contact, 'name' | 'email' | 'dni' | 'tags' | 'customFields' | 'importBatchId'>> = {},
        // false: `consent` solo vale para el contacto que se crea; en uno existente nunca se toca (lo usa la importación).
        raiseConsentOnExisting = true,
    ): Promise<{ contact: Contact; created: boolean }> {
        const existingConsent = raiseConsentOnExisting && consent;
        const existing = await this.contactRepo.findOne({ where: { placeId, phone } });
        if (existing) return { contact: await this.fillMissing(existing, existingConsent, fields), created: false };
        try {
            const contact = await this.contactRepo.save(this.contactRepo.create({ ...fields, placeId, phone, source, marketingConsent: consent }));
            return { contact, created: true };
        } catch (err) {
            // Dos altas del mismo cliente a la vez: gana la primera, la otra completa sobre ella.
            if (!isUniqueViolation(err)) throw err;
            const winner = await this.contactRepo.findOne({ where: { placeId, phone } });
            if (!winner) throw err;
            return { contact: await this.fillMissing(winner, existingConsent, fields), created: false };
        }
    }

    /**
     * Completa un contacto existente escribiendo SOLO las columnas que cambian (nunca la entidad entera):
     * así una lectura vieja no puede revivir un consentimiento que otro proceso retiró (BAJA) en el medio.
     * El consentimiento es de un solo sentido: aquí solo se puede poner en true.
     */
    private async fillMissing(existing: Contact, consent: boolean, fields: Record<string, any>): Promise<Contact> {
        const patch: Partial<Contact> = {};
        for (const key of FILL_KEYS) {
            if (!isEmpty(fields[key]) && isEmpty(existing[key])) (patch as any)[key] = fields[key];
        }
        if (consent && !existing.marketingConsent) patch.marketingConsent = true;
        if (Object.keys(patch).length === 0) return existing;
        await this.contactRepo.update({ id: existing.id }, patch);
        return Object.assign(existing, patch);
    }

    /** Teléfono de un alta o edición manual: null si viene vacío; 400 si trae algo sin dígitos. */
    private cleanPhone(phone?: string | null): string | null {
        if (phone === null || phone === undefined || String(phone).trim() === '') return null;
        const normalized = normalizePhone(String(phone));
        if (!normalized) throw new BadRequestException('El teléfono no es válido');
        return normalized;
    }

    async findAll(query: QueryContactDto): Promise<PaginatedResponse<Contact>> {
        const { page, search, source, tag, placeId } = query;
        const size = query.limitOrSize;
        const skip = (page - 1) * size;

        const where: any = { placeId };

        if (search) {
            where.name = Like(`%${search}%`);
        }
        if (source) {
            where.source = source;
        }
        if (tag) {
            where.tags = Like(`%"${tag}"%`);
        }

        const [data, total] = await this.contactRepo.findAndCount({
            where,
            order: { createdAt: 'DESC' },
            skip,
            take: size,
        });

        return {
            data,
            meta: { total, page, size, totalPages: Math.ceil(total / size) },
        };
    }

    async findById(id: string): Promise<Contact> {
        const contact = await this.contactRepo.findOne({ where: { id } });
        if (!contact) {
            throw new NotFoundException('Contacto no encontrado');
        }
        return contact;
    }

    async create(dto: CreateContactDto, placeId: string): Promise<Contact> {
        const phone = this.cleanPhone(dto.phone);
        const duplicate = 'Ya existe un contacto con ese teléfono en este local';
        if (phone && (await this.contactRepo.findOne({ where: { placeId, phone } }))) throw new ConflictException(duplicate);
        const contact = this.contactRepo.create({
            ...dto,
            phone,
            placeId,
            source: dto.source || 'import',
        } as Partial<Contact>);
        let saved: Contact;
        try {
            saved = await this.contactRepo.save(contact);
        } catch (err) {
            throw isUniqueViolation(err) ? new ConflictException(duplicate) : err;
        }
        await this.auditLogService.log({
            action: 'contact.created',
            entityType: 'contact',
            entityId: saved.id,
            placeId,
            metadata: { name: saved.name, phone: saved.phone, source: saved.source },
            description: `Contacto "${saved.name || saved.phone}" creado manualmente`,
        });
        return saved;
    }

    async update(id: string, dto: UpdateContactDto): Promise<Contact> {
        const contact = await this.findById(id);
        const patch: Partial<Contact> = { ...dto } as Partial<Contact>;
        if (dto.phone !== undefined) {
            const phone = this.cleanPhone(dto.phone);
            if (phone && phone !== contact.phone) {
                const other = await this.contactRepo.findOne({ where: { placeId: contact.placeId, phone } });
                if (other && other.id !== id) throw new ConflictException('Ya existe un contacto con ese teléfono en este local');
            }
            patch.phone = phone as string;
        }
        Object.assign(contact, patch);
        try {
            return await this.contactRepo.save(contact);
        } catch (err) {
            throw isUniqueViolation(err) ? new ConflictException('Ya existe un contacto con ese teléfono en este local') : err;
        }
    }

    async delete(id: string): Promise<void> {
        const contact = await this.findById(id);
        await this.contactRepo.remove(contact);
    }

    async importCsv(placeId: string, file: Express.Multer.File, columnMapping?: Record<string, string>): Promise<ContactImport> {
        const content = file.buffer.toString('utf-8');
        const result = Papa.parse(content, { header: true, skipEmptyLines: true });

        if (result.errors.length > 0) {
            this.logger.warn(`CSV parse errors: ${result.errors.length}`);
        }

        return this.processImport(placeId, file.originalname, result.data as any[], columnMapping);
    }

    async importExcel(placeId: string, file: Express.Multer.File, columnMapping?: Record<string, string>): Promise<ContactImport> {
        const workbook = XLSX.read(file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
            throw new BadRequestException('El archivo Excel no contiene hojas');
        }
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet);

        return this.processImport(placeId, file.originalname, data as any[], columnMapping);
    }

    private async processImport(
        placeId: string,
        filename: string,
        rows: any[],
        columnMapping?: Record<string, string>,
    ): Promise<ContactImport> {
        const importRecord = this.importRepo.create({
            placeId,
            filename,
            totalRows: rows.length,
            status: 'processing',
            columnMapping: columnMapping || null,
        });
        await this.importRepo.save(importRecord);

        let imported = 0;
        let failed = 0;
        const errors: any[] = [];

        for (let i = 0; i < rows.length; i++) {
            try {
                const raw = rows[i];
                const mapped = this.mapColumns(raw, columnMapping);
                const phone = normalizePhone(mapped.phone === null || mapped.phone === undefined ? null : String(mapped.phone));
                if (!phone) throw new Error('Teléfono vacío o inválido');
                // Un cliente repetido en el archivo, o que ya existe, solo completa campos vacíos. Una importación no es un
                // opt-in de esa persona (y podría deshacer una BAJA): el consentimiento del archivo vale solo para contactos nuevos.
                await this.upsert(
                    placeId,
                    phone,
                    'import',
                    mapped.marketingConsent === true || mapped.marketingConsent === 'true' || mapped.marketingConsent === 'yes',
                    {
                        name: mapped.name || null,
                        email: mapped.email || null,
                        dni: mapped.dni || null,
                        customFields: this.extractCustomFields(raw, columnMapping),
                        importBatchId: importRecord.id,
                        tags: mapped.tags ? (typeof mapped.tags === 'string' ? mapped.tags.split(',').map((t: string) => t.trim()) : mapped.tags) : null,
                    },
                    false,
                );
                imported++;
            } catch (err: any) {
                failed++;
                errors.push({ row: i + 2, error: err.message });
            }
        }

        importRecord.importedRows = imported;
        importRecord.failedRows = failed;
        importRecord.errorLog = errors.length > 0 ? errors : null;
        importRecord.status = 'completed';
        await this.importRepo.save(importRecord);

        await this.auditLogService.log({
            action: 'contacts.imported',
            entityType: 'contact_import',
            entityId: importRecord.id,
            placeId,
            metadata: { filename, total: rows.length, imported, failed },
            description: `Importación de ${filename}: ${imported} contactos importados, ${failed} fallos`,
        });

        return importRecord;
    }

    async getImportStatus(importId: string): Promise<ContactImport> {
        const record = await this.importRepo.findOne({ where: { id: importId } });
        if (!record) {
            throw new NotFoundException('Importación no encontrada');
        }
        return record;
    }

    async getImportsByPlace(placeId: string): Promise<ContactImport[]> {
        return this.importRepo.find({
            where: { placeId },
            order: { createdAt: 'DESC' },
        });
    }

    async exportContacts(placeId: string, format: 'csv' | 'xlsx'): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
        const contacts = await this.contactRepo.find({
            where: { placeId },
            order: { createdAt: 'DESC' },
        });

        const data = contacts.map(c => ({
            name: c.name || '',
            phone: c.phone || '',
            email: c.email || '',
            dni: c.dni || '',
            source: c.source,
            tags: c.tags ? c.tags.join(', ') : '',
            marketingConsent: c.marketingConsent ? 'Si' : 'No',
            createdAt: c.createdAt.toISOString(),
            ...(c.customFields || {}),
        }));

        if (format === 'csv') {
            const csv = Papa.unparse(data);
            return {
                buffer: Buffer.from(csv, 'utf-8'),
                contentType: 'text/csv',
                filename: `contactos-${new Date().toISOString().split('T')[0]}.csv`,
            };
        } else {
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(data);
            XLSX.utils.book_append_sheet(wb, ws, 'Contactos');
            const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
            return {
                buffer: Buffer.from(buffer),
                contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                filename: `contactos-${new Date().toISOString().split('T')[0]}.xlsx`,
            };
        }
    }

    private mapColumns(raw: any, columnMapping?: Record<string, string>): Record<string, any> {
        if (!columnMapping) {
            return {
                name: raw.name || raw.Nombre || raw.nombre || raw.NAME || raw.Name || null,
                phone: raw.phone || raw.Telefono || raw.teléfono || raw.telefono || raw.celular || raw.Celular || raw.PHONE || raw.Phone || null,
                email: raw.email || raw.Email || raw.EMAIL || raw.Correo || raw.correo || null,
                dni: raw.dni || raw.DNI || raw.Dni || null,
                tags: raw.tags || raw.Tags || raw.TAGS || raw.etiquetas || raw.Etiquetas || null,
                marketingConsent: raw.marketingConsent || raw.consent || raw.Consent || null,
            };
        }

        const mapped: any = {};
        for (const [field, column] of Object.entries(columnMapping)) {
            mapped[field] = raw[column] || raw[column.toLowerCase()] || null;
        }
        return mapped;
    }

    private extractCustomFields(raw: any, columnMapping?: Record<string, string>): Record<string, any> {
        const knownKeys = new Set([
            'name', 'Nombre', 'nombre', 'NAME', 'Name',
            'phone', 'Telefono', 'teléfono', 'telefono', 'celular', 'Celular', 'PHONE', 'Phone',
            'email', 'Email', 'EMAIL', 'Correo', 'correo',
            'dni', 'DNI', 'Dni',
            'tags', 'Tags', 'TAGS', 'etiquetas', 'Etiquetas',
            'marketingConsent', 'consent', 'Consent',
        ]);

        if (columnMapping) {
            const mappedKeys = new Set(Object.values(columnMapping).map(v => v.toLowerCase()));
            const extra: any = {};
            for (const [key, value] of Object.entries(raw)) {
                if (!mappedKeys.has(key.toLowerCase()) && value !== null && value !== undefined && value !== '') {
                    extra[key] = value;
                }
            }
            return Object.keys(extra).length > 0 ? extra : null;
        }

        const extra: any = {};
        for (const [key, value] of Object.entries(raw)) {
            if (!knownKeys.has(key) && value !== null && value !== undefined && value !== '') {
                extra[key] = value;
            }
        }
        return Object.keys(extra).length > 0 ? extra : null;
    }

    async syncFromConversations(placeId: string): Promise<number> {
        const result = await this.contactRepo.query(
            `SELECT DISTINCT customer_phone, customer_name
             FROM wuarike_db.conversations
             WHERE place_id = $1
               AND customer_phone IS NOT NULL`,
            [placeId]
        );

        let synced = 0;
        for (const row of result) {
            const phone = normalizePhone(row.customer_phone);
            if (!phone) continue;
            const { created } = await this.upsert(placeId, phone, 'whatsapp', false, { name: row.customer_name || null });
            if (created) synced++;
        }
        return synced;
    }

    async syncFromPublicFeedback(placeId: string): Promise<number> {
        const result = await this.contactRepo.query(
            `SELECT DISTINCT ON (customer_contact) customer_name, customer_contact, marketing_consent
             FROM wuarike_db.public_feedback
             WHERE place_id = $1
               AND customer_contact IS NOT NULL`,
            [placeId]
        );

        let synced = 0;
        for (const row of result) {
            const contactVal = row.customer_contact;
            const isEmail = typeof contactVal === 'string' && contactVal.includes('@');

            if (isEmail) {
                const existing = await this.contactRepo.findOne({ where: { placeId, email: contactVal, source: 'feedback' } });
                if (!existing) {
                    await this.contactRepo.save(this.contactRepo.create({
                        placeId,
                        name: row.customer_name || null,
                        email: contactVal,
                        marketingConsent: row.marketing_consent || false,
                        source: 'feedback',
                    }));
                    synced++;
                }
                continue;
            }

            const phone = normalizePhone(contactVal);
            if (!phone) continue;
            // El consentimiento de la opinión es explícito (lo pide el formulario), por eso se copia.
            const { created } = await this.upsert(placeId, phone, 'feedback', row.marketing_consent === true, { name: row.customer_name || null });
            if (created) synced++;
        }
        return synced;
    }

    /** Ficha del cliente: datos, tarjeta de fidelización y, en una línea de tiempo, sus pedidos y conversaciones. */
    async getProfile(placeId: string, contactId: string): Promise<{ contact: Contact; loyaltyCard: LoyaltyCard | null; timeline: TimelineEntry[] }> {
        const contact = await this.contactRepo.findOne({ where: { id: contactId, placeId } });
        if (!contact) throw new NotFoundException('Contacto no encontrado');
        const last9 = lastNine(contact.phone);
        if (!last9) return { contact, loyaltyCard: null, timeline: [] };

        const [orders, conversations, loyaltyCard] = await Promise.all([
            this.ordersRepo.createQueryBuilder('o')
                .where('o.placeId = :placeId', { placeId }).andWhere(samePhone('o.customerPhone'), { last9 })
                .orderBy('o.createdAt', 'DESC').take(TIMELINE_MAX).getMany(),
            this.conversationsRepo.createQueryBuilder('c')
                .where('c.placeId = :placeId', { placeId }).andWhere(samePhone('c.customerPhone'), { last9 })
                .orderBy('c.createdAt', 'DESC').take(TIMELINE_MAX).getMany(),
            this.cardsRepo.createQueryBuilder('l')
                .where('l.placeId = :placeId', { placeId }).andWhere(samePhone('l.customerPhone'), { last9 })
                .orderBy('l.updatedAt', 'DESC').getOne(),
        ]);

        const timeline: TimelineEntry[] = [
            ...orders.map((o) => ({ at: o.createdAt.toISOString(), kind: 'order' as const, title: `Pedido #${o.number} · ${ORDER_STATUS_LABEL[o.status] ?? o.status}`, amount: o.total })),
            ...conversations.map((c) => ({ at: c.createdAt.toISOString(), kind: 'conversation' as const, title: `Conversación por WhatsApp · ${CONVERSATION_STATUS_LABEL[c.status] ?? c.status}` })),
        ];
        if (loyaltyCard) {
            timeline.push({ at: loyaltyCard.createdAt.toISOString(), kind: 'loyalty', title: 'Se unió al programa de fidelización' });
            if (loyaltyCard.lastVisitAt && loyaltyCard.totalVisits > 1) {
                timeline.push({ at: loyaltyCard.lastVisitAt.toISOString(), kind: 'loyalty', title: `Última visita registrada (${loyaltyCard.totalVisits} en total)` });
            }
        }
        timeline.sort((a, b) => b.at.localeCompare(a.at));
        return { contact, loyaltyCard, timeline: timeline.slice(0, TIMELINE_MAX) };
    }

    async getImportById(id: string): Promise<ContactImport> {
        const record = await this.importRepo.findOne({ where: { id } });
        if (!record) {
            throw new NotFoundException('Importación no encontrada');
        }
        return record;
    }
}

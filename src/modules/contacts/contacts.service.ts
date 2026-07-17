import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Contact } from './entities/contact.entity';
import { ContactImport } from './entities/contact-import.entity';
import { QueryContactDto } from './dto/query-contact.dto';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { PaginatedResponse } from '../../common/dto/pagination.dto';
import { AuditLogService } from '../audit-log/audit-log.service';
import * as Papa from 'papaparse';
import * as XLSX from 'xlsx';

@Injectable()
export class ContactsService {
    private readonly logger = new Logger(ContactsService.name);

    constructor(
        @InjectRepository(Contact)
        private contactRepo: Repository<Contact>,
        @InjectRepository(ContactImport)
        private importRepo: Repository<ContactImport>,
        private auditLogService: AuditLogService,
    ) {}

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
        const contact = this.contactRepo.create({
            ...dto,
            placeId,
            source: dto.source || 'import',
        });
        const saved = await this.contactRepo.save(contact);
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
        Object.assign(contact, dto);
        return this.contactRepo.save(contact);
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
                const contact = this.contactRepo.create({
                    placeId,
                    name: mapped.name || null,
                    phone: mapped.phone || null,
                    email: mapped.email || null,
                    dni: mapped.dni || null,
                    customFields: this.extractCustomFields(raw, columnMapping),
                    source: 'import',
                    importBatchId: importRecord.id,
                    tags: mapped.tags ? (typeof mapped.tags === 'string' ? mapped.tags.split(',').map((t: string) => t.trim()) : mapped.tags) : null,
                    marketingConsent: mapped.marketingConsent === true || mapped.marketingConsent === 'true' || mapped.marketingConsent === 'yes',
                });
                await this.contactRepo.save(contact);
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
             FROM conversations
             WHERE place_id = $1
               AND customer_phone IS NOT NULL`,
            [placeId]
        );

        let synced = 0;
        for (const row of result) {
            const existing = await this.contactRepo.findOne({
                where: { placeId, phone: row.customer_phone, source: 'whatsapp' },
            });
            if (!existing) {
                const contact = this.contactRepo.create({
                    placeId,
                    name: row.customer_name || null,
                    phone: row.customer_phone,
                    source: 'whatsapp',
                });
                await this.contactRepo.save(contact);
                synced++;
            }
        }
        return synced;
    }

    async syncFromPublicFeedback(placeId: string): Promise<number> {
        const result = await this.contactRepo.query(
            `SELECT DISTINCT ON (customer_contact) customer_name, customer_contact, marketing_consent
             FROM public_feedback
             WHERE place_id = $1
               AND customer_contact IS NOT NULL`,
            [placeId]
        );

        let synced = 0;
        for (const row of result) {
            const contactVal = row.customer_contact;
            const isEmail = typeof contactVal === 'string' && contactVal.includes('@');

            const existing = await this.contactRepo.findOne({
                where: [
                    { placeId, phone: !isEmail ? contactVal : null, source: 'feedback' },
                    { placeId, email: isEmail ? contactVal : null, source: 'feedback' },
                ],
            });
            if (!existing) {
                const contact = this.contactRepo.create({
                    placeId,
                    name: row.customer_name || null,
                    phone: !isEmail ? contactVal : null,
                    email: isEmail ? contactVal : null,
                    marketingConsent: row.marketing_consent || false,
                    source: 'feedback',
                });
                await this.contactRepo.save(contact);
                synced++;
            }
        }
        return synced;
    }

    async getImportById(id: string): Promise<ContactImport> {
        const record = await this.importRepo.findOne({ where: { id } });
        if (!record) {
            throw new NotFoundException('Importación no encontrada');
        }
        return record;
    }
}

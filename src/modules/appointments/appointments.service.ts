import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, EntityManager, In, Not, Repository } from 'typeorm';
import { Professional } from './entities/professional.entity';
import { Appointment, AppointmentSource } from './entities/appointment.entity';
import { AssetKind, CustomerAsset } from './entities/customer-asset.entity';
import { RemindersService, safeName } from './reminders.service';
import { Dish } from '../places/entities/dish.entity';
import { Place } from '../places/entities/place.entity';
import { newPublicToken, normalizePhone, toCents } from '../orders/order-rules';
import { PlaceTeamService } from '../team/place-team.service';
import { getVerticalConfig } from '../places/business-types';
import { DEFAULT_DURATION_MIN, Range, freeSlots, limaDate, limaInstant, limaTime, overlaps, workingWindow } from './appointments.rules';
import { AssetDto, BookDto, ProfessionalDto, UpdateAppointmentDto } from './dto/appointments.dto';

const LIVE: Appointment['status'][] = ['RESERVADA', 'LISTO', 'ATENDIDA'];
/** Datos de ficha aceptados (mascota y vehículo); el resto se descarta. */
const ASSET_FIELDS = ['species', 'breed', 'birthDate', 'sex', 'weight', 'vaccines', 'brand', 'model', 'year', 'color', 'mileage'];
const MAX_DAYS_AHEAD = 60;
/** Citas futuras activas que un mismo teléfono puede tener en un local (link público y bot). */
const MAX_ACTIVE_PER_PHONE = 3;

/** Agenda por profesional: cada cita ocupa a una persona; dos citas de la misma persona nunca se cruzan. */
@Injectable()
export class AppointmentsService {
    constructor(
        @InjectRepository(Professional) private prosRepo: Repository<Professional>,
        @InjectRepository(Appointment) private apptRepo: Repository<Appointment>,
        @InjectRepository(Dish) private dishesRepo: Repository<Dish>,
        @InjectRepository(Place) private placesRepo: Repository<Place>,
        @InjectRepository(CustomerAsset) private assetsRepo: Repository<CustomerAsset>,
        private dataSource: DataSource,
        private team: PlaceTeamService,
        private reminders: RemindersService,
    ) { }

    /** La agenda existe si el local tiene plan activo y su rubro atiende con cita. */
    async assertEnabled(placeId: string) {
        const place = await this.placesRepo.findOne({ where: { id: placeId }, select: ['id', 'businessType'] });
        if (!place) throw new NotFoundException('Local no encontrado');
        if (!getVerticalConfig(place.businessType).modules.includes('agenda')) throw new ForbiddenException('Este local no usa agenda de citas');
        await this.team.assertPlaceTier(placeId, 'reputacion');
    }

    // ── Servicios y profesionales ────────────────────────────────────────
    /** Servicios reservables: los ítems de tipo servicio disponibles del catálogo. */
    async services(placeId: string) {
        const dishes = await this.dishesRepo.find({ where: { placeId, isAvailable: true, kind: 'servicio' }, order: { displayOrder: 'ASC', name: 'ASC' } });
        return dishes.map((d) => ({ id: d.id, name: d.name, description: d.description, price: toCents(d.price as any), durationMin: d.durationMin || DEFAULT_DURATION_MIN }));
    }

    professionals(placeId: string, onlyActive = false) {
        return this.prosRepo.find({ where: { placeId, ...(onlyActive ? { active: true } : {}) }, order: { displayOrder: 'ASC', name: 'ASC' } });
    }

    async saveProfessional(placeId: string, id: string | null, dto: ProfessionalDto) {
        const current = id ? await this.prosRepo.findOne({ where: { id, placeId } }) : null;
        if (id && !current) throw new NotFoundException('Profesional no encontrado');
        if (dto.schedule?.some((h) => h.close <= h.open)) throw new BadRequestException('La hora de salida debe ser después de la de entrada');
        const existing = id ? 0 : await this.prosRepo.count({ where: { placeId } });
        return this.prosRepo.save({ ...(current ?? { placeId, displayOrder: existing, active: true, serviceIds: [], daysOff: [] }), ...dto, name: dto.name.trim() });
    }

    // ── Disponibilidad ───────────────────────────────────────────────────
    /** Horarios libres de ese día para el servicio, por profesional (solo los que hacen ese servicio). */
    async availability(placeId: string, serviceId: string, date: string, professionalId?: string | null) {
        const service = await this.requireService(placeId, serviceId);
        const place = await this.placesRepo.findOne({ where: { id: placeId }, select: ['id', 'openingHours'] });
        const pros = (await this.professionals(placeId, true)).filter((p) => (!professionalId || p.id === professionalId) && this.doesService(p, serviceId));
        const busy = await this.busyByPro(this.apptRepo.manager, pros.map((p) => p.id), date);
        const now = new Date();
        const byPro = pros.map((p) => ({
            id: p.id, name: p.name, station: p.station, photoUrl: p.photoUrl,
            slots: freeSlots(workingWindow(p, place?.openingHours ?? null, date), busy.get(p.id) ?? [], service.durationMin, now).map(limaTime),
        }));
        const any = [...new Set(byPro.flatMap((p) => p.slots))].sort();
        return { date, service, professionals: byPro, any };
    }

    // ── Reservar ─────────────────────────────────────────────────────────
    /**
     * Crea la cita. Con profesional: solo ese. Sin profesional ("cualquiera"): el primero libre a esa hora.
     * Cada intento bloquea la fila del profesional y vuelve a revisar cruces dentro del bloqueo.
     */
    async book(placeId: string, dto: BookDto, source: AppointmentSource, userId: string | null) {
        const service = await this.requireService(placeId, dto.serviceId);
        const place = await this.placesRepo.findOne({ where: { id: placeId }, select: ['id', 'openingHours'] });
        const candidates = (await this.professionals(placeId, true)).filter((p) => (!dto.professionalId || p.id === dto.professionalId) && this.doesService(p, dto.serviceId));
        if (!candidates.length) throw new BadRequestException(dto.professionalId ? 'Ese profesional no hace este servicio' : 'Nadie hace este servicio por ahora');
        const slot = this.slot(dto.date, dto.time, service.durationMin);
        if (slot.start <= new Date()) throw new BadRequestException('Ese horario ya pasó');
        if (slot.start.getTime() > Date.now() + MAX_DAYS_AHEAD * 86400_000) throw new BadRequestException(`Solo se puede reservar hasta ${MAX_DAYS_AHEAD} días adelante`);
        // Mismo número escrito de distintas formas (+51, espacios, guiones) = un solo cliente.
        const phone = normalizePhone(dto.customerPhone);
        // Desde afuera el teléfono es obligatorio y válido: sin él no se podría aplicar el tope por cliente.
        if (source !== 'PANEL' && (!phone || phone.length < 7)) throw new BadRequestException('Ingresa un teléfono válido');
        const capped = source !== 'PANEL';
        const assetId = await this.resolveAsset(placeId, dto, phone, source);

        for (const pro of candidates) {
            const created = await this.dataSource.transaction(async (em) => {
                if (capped) {
                    // Desde afuera (link público o bot) un teléfono no puede acaparar la agenda. El bloqueo por
                    // (local, teléfono) hace que reservas simultáneas del mismo número se cuenten de a una.
                    await em.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`${placeId}:${phone}`]);
                    const [{ n }] = await em.query(
                        `SELECT count(*)::int AS n FROM wuarike_db.appointments WHERE place_id = $1 AND customer_phone = $2 AND status = 'RESERVADA' AND starts_at > now()`,
                        [placeId, phone],
                    );
                    if (n >= MAX_ACTIVE_PER_PHONE) throw new BadRequestException(`Ya tienes ${n} citas reservadas. Cancela alguna o comunícate con el local.`);
                }
                if (!(await this.fits(em, pro, place?.openingHours ?? null, dto.date, slot))) return null;
                return em.save(em.create(Appointment, {
                    placeId, professionalId: pro.id, serviceId: service.id, serviceName: service.name, durationMin: service.durationMin, price: service.price,
                    startsAt: slot.start, endsAt: slot.end, customerName: dto.customerName.trim(), customerPhone: phone,
                    notes: dto.notes?.trim() || null, status: 'RESERVADA', source, publicToken: newPublicToken(), createdByUserId: userId, assetId,
                }));
            });
            if (created) return this.view(created, pro, assetId ? await this.assetsRepo.findOne({ where: { id: assetId } }) : null);
        }
        throw new BadRequestException('Ese horario ya no está disponible. Elige otro.');
    }

    // ── Calendario ───────────────────────────────────────────────────────
    /** Día del calendario: profesionales (con su horario de ese día) y sus citas. */
    async day(placeId: string, date: string) {
        const place = await this.placesRepo.findOne({ where: { id: placeId }, select: ['id', 'openingHours'] });
        const pros = await this.professionals(placeId, true);
        const from = limaInstant(date, '00:00');
        const to = limaInstant(date, '23:59');
        const appts = await this.apptRepo.createQueryBuilder('a')
            .where('a.place_id = :placeId AND a.starts_at BETWEEN :from AND :to', { placeId, from, to })
            .orderBy('a.starts_at', 'ASC').getMany();
        const assetIds = appts.map((a) => a.assetId).filter(Boolean) as string[];
        const assets = assetIds.length ? await this.assetsRepo.find({ where: { id: In(assetIds) } }) : [];
        return {
            date,
            professionals: pros.map((p) => {
                const w = workingWindow(p, place?.openingHours ?? null, date);
                return { id: p.id, name: p.name, station: p.station, photoUrl: p.photoUrl, open: w ? limaTime(w.start) : null, close: w ? limaTime(w.end) : null };
            }),
            appointments: appts.map((a) => this.view(a, pros.find((p) => p.id === a.professionalId), assets.find((x) => x.id === a.assetId))),
        };
    }

    async update(placeId: string, id: string, dto: UpdateAppointmentDto) {
        const appt = await this.apptRepo.findOne({ where: { id, placeId } });
        if (!appt) throw new NotFoundException('Cita no encontrada');
        if (dto.date || dto.time || dto.professionalId) {
            const pro = await this.prosRepo.findOne({ where: { id: dto.professionalId ?? appt.professionalId, placeId } });
            if (!pro) throw new NotFoundException('Profesional no encontrado');
            const date = dto.date ?? limaDate(appt.startsAt);
            const slot = this.slot(date, dto.time ?? limaTime(appt.startsAt), appt.durationMin);
            const place = await this.placesRepo.findOne({ where: { id: placeId }, select: ['id', 'openingHours'] });
            const ok = await this.dataSource.transaction(async (em) => {
                if (!(await this.fits(em, pro, place?.openingHours ?? null, date, slot, appt.id))) return false;
                await em.update(Appointment, { id: appt.id }, { professionalId: pro.id, startsAt: slot.start, endsAt: slot.end, status: dto.status ?? appt.status });
                return true;
            });
            if (!ok) throw new BadRequestException('Ese horario no está disponible para ese profesional');
        } else if (dto.status) {
            await this.apptRepo.update({ id: appt.id }, { status: dto.status });
        }
        const fresh = (await this.apptRepo.findOne({ where: { id: appt.id } }))!;
        const asset = fresh.assetId ? await this.assetsRepo.findOne({ where: { id: fresh.assetId } }) : null;
        let notified: boolean | undefined;
        if (dto.status === 'LISTO' && appt.status !== 'LISTO' && asset?.kind === 'VEHICLE' && fresh.customerPhone) {
            const place = await this.placesRepo.findOne({ where: { id: placeId }, select: ['id', 'name'] });
            notified = await this.reminders.sendSystemTemplate(placeId, 'vehicleReady', fresh.customerPhone, [safeName(fresh.customerName), asset.name, place?.name ?? 'el taller']).catch(() => false);
        }
        return { ...this.view(fresh, await this.prosRepo.findOne({ where: { id: fresh.professionalId } }), asset), notified };
    }

    // ── Link público ─────────────────────────────────────────────────────
    async publicInfo(placeId: string) {
        const place = await this.placesRepo.findOne({ where: { id: placeId }, select: ['id', 'name', 'logoUrl', 'coverImageUrl', 'address', 'businessType'] });
        if (!place) throw new NotFoundException('Local no encontrado');
        const pros = await this.professionals(placeId, true);
        const { businessType, ...publicPlace } = place;
        return {
            place: publicPlace,
            assetKind: getVerticalConfig(businessType).assetKind ?? null,
            services: await this.services(placeId),
            professionals: pros.map((p) => ({ id: p.id, name: p.name, station: p.station, photoUrl: p.photoUrl, serviceIds: p.serviceIds })),
        };
    }

    async byToken(token: string) {
        const appt = await this.apptRepo.findOne({ where: { publicToken: token } });
        if (!appt) throw new NotFoundException('Cita no encontrada');
        const [pro, place] = await Promise.all([
            this.prosRepo.findOne({ where: { id: appt.professionalId } }),
            this.placesRepo.findOne({ where: { id: appt.placeId }, select: ['id', 'name', 'address'] }),
        ]);
        const asset = appt.assetId ? await this.assetsRepo.findOne({ where: { id: appt.assetId } }) : null;
        const { customerPhone, createdByUserId, asset: full, ...rest } = this.view(appt, pro, asset);
        return { ...rest, assetName: full?.name ?? null, place };
    }

    async cancelByToken(token: string) {
        const appt = await this.apptRepo.findOne({ where: { publicToken: token } });
        if (!appt) throw new NotFoundException('Cita no encontrada');
        if (appt.status !== 'RESERVADA' || appt.startsAt <= new Date()) throw new BadRequestException('Esta cita ya no se puede cancelar');
        await this.apptRepo.update({ id: appt.id, status: 'RESERVADA' }, { status: 'CANCELADA' });
        return this.byToken(token);
    }

    // ── Fichas (mascota o vehículo) ─────────────────────────────────────
    async assetKind(placeId: string): Promise<AssetKind | null> {
        const place = await this.placesRepo.findOne({ where: { id: placeId }, select: ['id', 'businessType'] });
        return place ? getVerticalConfig(place.businessType).assetKind ?? null : null;
    }

    async assets(placeId: string, phone?: string) {
        const normalized = phone ? normalizePhone(phone) : null;
        // Un teléfono que no se puede leer no debe traer las fichas de todo el local.
        if (phone && !normalized) return [];
        return this.assetsRepo.find({ where: { placeId, ...(normalized ? { customerPhone: normalized } : {}) }, order: { name: 'ASC' }, take: 200 });
    }

    async saveAsset(placeId: string, id: string | null, dto: AssetDto) {
        const kind = await this.assetKind(placeId);
        if (!kind) throw new BadRequestException('Este rubro no usa fichas de mascota ni de vehículo');
        const current = id ? await this.assetsRepo.findOne({ where: { id, placeId } }) : null;
        if (id && !current) throw new NotFoundException('Ficha no encontrada');
        const phone = normalizePhone(dto.customerPhone);
        if (!phone) throw new BadRequestException('Ingresa un teléfono válido');
        return this.assetsRepo.save({
            ...(current ?? { placeId, kind }), customerPhone: phone, customerName: dto.customerName?.trim() || current?.customerName || null,
            name: this.assetName(kind, dto.name), data: { ...(current?.data ?? {}), ...this.cleanData(dto.data) }, notes: dto.notes ?? current?.notes ?? null,
        });
    }

    /** Ficha de la cita: la existente (assetId) o una nueva por nombre/placa (se reutiliza si el cliente ya la tenía). */
    private async resolveAsset(placeId: string, dto: BookDto, phone: string | null, source: AppointmentSource): Promise<string | null> {
        if (dto.assetId) {
            // Desde afuera (link o bot) solo se puede usar una ficha del mismo teléfono que reserva.
            const found = await this.assetsRepo.findOne({ where: { id: dto.assetId, placeId, ...(source !== 'PANEL' ? { customerPhone: phone ?? '' } : {}) } });
            if (!found) throw new BadRequestException('Ficha no encontrada');
            return found.id;
        }
        if (!dto.assetName?.trim() || !phone) return null;
        const kind = await this.assetKind(placeId);
        if (!kind) return null;
        const name = this.assetName(kind, dto.assetName);
        const existing = await this.assetsRepo.createQueryBuilder('x')
            .where('x.place_id = :placeId AND x.customer_phone = :phone AND x.kind = :kind AND lower(x.name) = lower(:name)', { placeId, phone, kind, name })
            .getOne();
        if (existing) return existing.id;
        const created = await this.assetsRepo.save(this.assetsRepo.create({ placeId, customerPhone: phone, customerName: dto.customerName.trim(), kind, name, data: this.cleanData(dto.assetData) }));
        return created.id;
    }

    private cleanData(data?: Record<string, unknown> | null) {
        const out: Record<string, string | null> = {};
        for (const k of ASSET_FIELDS) if (data && k in data) out[k] = data[k] == null ? null : String(data[k]).slice(0, 60);
        return out;
    }

    /** Placas en mayúsculas y sin espacios (ABC-123); nombres de mascota tal cual. */
    private assetName(kind: AssetKind, name: string) {
        return kind === 'VEHICLE' ? name.toUpperCase().replace(/\s+/g, '') : name.trim();
    }

    // ── Internos ─────────────────────────────────────────────────────────
    async requireService(placeId: string, serviceId: string) {
        const service = (await this.services(placeId)).find((s) => s.id === serviceId);
        if (!service) throw new BadRequestException('Ese servicio no está disponible');
        return service;
    }

    doesService(pro: Professional, serviceId: string) {
        return !pro.serviceIds?.length || pro.serviceIds.includes(serviceId);
    }

    private slot(date: string, time: string, durationMin: number): Range {
        const start = limaInstant(date, time);
        return { start, end: new Date(start.getTime() + durationMin * 60_000) };
    }

    /** Dentro de una transacción: bloquea al profesional y confirma que el horario cae en su jornada y está libre. */
    private async fits(em: EntityManager, pro: Professional, placeHours: Professional['schedule'], date: string, slot: Range, excludeId?: string) {
        await em.query(`SELECT id FROM wuarike_db.place_professionals WHERE id = $1 FOR UPDATE`, [pro.id]);
        const w = workingWindow(pro, placeHours, date);
        if (!w || slot.start < w.start || slot.end > w.end) return false;
        const busy = (await this.busyByPro(em, [pro.id], date, excludeId)).get(pro.id) ?? [];
        return !busy.some((b) => overlaps(slot, b));
    }

    private async busyByPro(em: EntityManager, proIds: string[], date: string, excludeId?: string) {
        const map = new Map<string, Range[]>();
        if (!proIds.length) return map;
        // Margen de un día a cada lado: una cita que empieza la noche anterior también ocupa.
        const from = new Date(limaInstant(date, '00:00').getTime() - 86400_000);
        const to = new Date(limaInstant(date, '23:59').getTime() + 86400_000);
        const rows = await em.find(Appointment, {
            where: { professionalId: In(proIds), status: In(LIVE), startsAt: Between(from, to), ...(excludeId ? { id: Not(excludeId) } : {}) },
        });
        for (const a of rows) map.set(a.professionalId, [...(map.get(a.professionalId) ?? []), { start: a.startsAt, end: a.endsAt }]);
        return map;
    }

    private view(a: Appointment, pro?: Professional | null, asset?: CustomerAsset | null) {
        return {
            ...a, date: limaDate(a.startsAt), time: limaTime(a.startsAt), endTime: limaTime(a.endsAt),
            professional: pro ? { id: pro.id, name: pro.name, station: pro.station, photoUrl: pro.photoUrl } : null,
            asset: asset ? { id: asset.id, kind: asset.kind, name: asset.name, data: asset.data } : null,
        };
    }
}

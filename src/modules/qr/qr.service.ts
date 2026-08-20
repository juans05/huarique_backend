import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { QrCode, QrCodeStatus, QrPhysicalType } from './entities/qr-code.entity';
import { QrAssignment, QrDestinationType } from './entities/qr-assignment.entity';
import { QrScan } from './entities/qr-scan.entity';
import { GenerateBatchDto } from './dto/generate-batch.dto';
import { AssignQrDto } from './dto/assign-qr.dto';
import { Place } from '../places/entities/place.entity';
import { Category } from '../places/entities/category.entity';
import { Ubigeo } from '../ubigeo/entities/ubigeo.entity';

// Alfabeto sin caracteres ambiguos (sin 0/O, 1/I) para que el token se
// pueda leer/tipear a mano si hace falta.
const TOKEN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TOKEN_LENGTH = 8;

@Injectable()
export class QrService {
    constructor(
        @InjectRepository(QrCode)
        private qrCodesRepository: Repository<QrCode>,
        @InjectRepository(QrAssignment)
        private assignmentsRepository: Repository<QrAssignment>,
        @InjectRepository(QrScan)
        private scansRepository: Repository<QrScan>,
        @InjectRepository(Place)
        private placesRepository: Repository<Place>,
        @InjectRepository(Category)
        private categoryRepository: Repository<Category>,
        @InjectRepository(Ubigeo)
        private ubigeoRepository: Repository<Ubigeo>,
        @InjectDataSource()
        private dataSource: DataSource,
    ) { }

    private generateToken(): string {
        const bytes = randomBytes(TOKEN_LENGTH);
        let token = '';
        for (let i = 0; i < TOKEN_LENGTH; i++) {
            token += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length];
        }
        return token;
    }

    async generateBatch(dto: GenerateBatchDto): Promise<QrCode[]> {
        const physicalType = dto.physicalType ?? QrPhysicalType.QR;
        const created: QrCode[] = [];

        for (let i = 0; i < dto.count; i++) {
            let token = this.generateToken();
            // Colisión de token: prácticamente imposible (40 bits), pero
            // reintentamos por seguridad en vez de asumir.
            while (await this.qrCodesRepository.exist({ where: { token } })) {
                token = this.generateToken();
            }

            const [{ nextval }] = await this.dataSource.query(
                "SELECT nextval('wuarike_db.qr_code_seq') as nextval",
            );
            const code = `QR-${String(nextval).padStart(6, '0')}`;

            const qrCode = this.qrCodesRepository.create({ token, code, physicalType });
            created.push(await this.qrCodesRepository.save(qrCode));
        }

        return created;
    }

    async findAll(status?: QrCodeStatus, search?: string) {
        const query = this.qrCodesRepository
            .createQueryBuilder('qrCode')
            .leftJoin(
                QrAssignment,
                'assignment',
                'assignment.qrCodeId = qrCode.id AND assignment.unassignedAt IS NULL',
            )
            .leftJoin(Place, 'place', 'place.id = assignment.placeId')
            .addSelect('place.name', 'currentPlaceName')
            .orderBy('qrCode.createdAt', 'DESC')
            .take(200);

        if (status) query.andWhere('qrCode.status = :status', { status });
        if (search) query.andWhere('qrCode.code ILIKE :search', { search: `%${search}%` });

        const { entities, raw } = await query.getRawAndEntities();
        return entities.map((qrCode, i) => ({ ...qrCode, currentPlaceName: raw[i].currentPlaceName ?? null }));
    }

    async findOne(id: string) {
        const qrCode = await this.qrCodesRepository.findOne({ where: { id } });
        if (!qrCode) throw new NotFoundException('QR no encontrado');

        const history = await this.assignmentsRepository.find({
            where: { qrCodeId: id },
            relations: ['place', 'assignedByUser'],
            select: {
                place: { id: true, name: true, address: true },
                assignedByUser: { id: true, email: true, fullName: true },
            },
            order: { assignedAt: 'DESC' },
        });

        return { qrCode, history };
    }

    async stats() {
        const [total, available, assigned, suspended] = await Promise.all([
            this.qrCodesRepository.count(),
            this.qrCodesRepository.count({ where: { status: QrCodeStatus.AVAILABLE } }),
            this.qrCodesRepository.count({ where: { status: QrCodeStatus.ASSIGNED } }),
            this.qrCodesRepository.count({ where: { status: QrCodeStatus.SUSPENDED } }),
        ]);

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const startOfMonth = new Date(startOfDay.getFullYear(), startOfDay.getMonth(), 1);

        const [scansTotal, scansToday, scansMonth] = await Promise.all([
            this.scansRepository.count(),
            this.scansRepository
                .createQueryBuilder('scan')
                .where('scan.createdAt >= :startOfDay', { startOfDay })
                .getCount(),
            this.scansRepository
                .createQueryBuilder('scan')
                .where('scan.createdAt >= :startOfMonth', { startOfMonth })
                .getCount(),
        ]);

        return {
            qrCodes: { total, available, assigned, suspended },
            scans: { total: scansTotal, today: scansToday, month: scansMonth },
        };
    }

    private async resolveOrCreatePlace(dto: AssignQrDto): Promise<Place> {
        if (dto.placeId) {
            const place = await this.placesRepository.findOne({ where: { id: dto.placeId } });
            if (!place) throw new NotFoundException('Local no encontrado');
            return place;
        }

        if (!dto.newPlace) {
            throw new BadRequestException('Debes indicar placeId o newPlace');
        }

        const category = await this.categoryRepository.findOne({ where: { id: dto.newPlace.categoryId } });
        if (!category) throw new BadRequestException('Categoría no encontrada');

        const district = await this.ubigeoRepository.findOne({ where: { district: dto.newPlace.district } });
        if (!district) throw new BadRequestException(`Distrito '${dto.newPlace.district}' no encontrado`);

        const place = this.placesRepository.create({
            name: dto.newPlace.name,
            nameNormalized: dto.newPlace.name.toLowerCase().trim(),
            category,
            district,
            address: dto.newPlace.address ?? null,
            phone: dto.newPlace.phone ?? null,
            latitude: dto.newPlace.latitude ?? null,
            longitude: dto.newPlace.longitude ?? null,
            location:
                dto.newPlace.latitude != null && dto.newPlace.longitude != null
                    ? { type: 'Point', coordinates: [dto.newPlace.longitude, dto.newPlace.latitude] }
                    : null,
            status: 'active',
        });

        return this.placesRepository.save(place);
    }

    private async createAssignment(qrCode: QrCode, dto: AssignQrDto, adminUserId: string) {
        const place = await this.resolveOrCreatePlace(dto);

        const assignment = this.assignmentsRepository.create({
            qrCodeId: qrCode.id,
            placeId: place.id,
            destinationType: dto.destinationType,
            destinationUrl: dto.destinationType === QrDestinationType.CUSTOM_URL ? dto.destinationUrl : null,
            assignedBy: adminUserId,
            reason: dto.reason ?? null,
        });
        await this.assignmentsRepository.save(assignment);

        qrCode.status = QrCodeStatus.ASSIGNED;
        await this.qrCodesRepository.save(qrCode);

        return assignment;
    }

    async assign(id: string, dto: AssignQrDto, adminUserId: string) {
        const qrCode = await this.qrCodesRepository.findOne({ where: { id } });
        if (!qrCode) throw new NotFoundException('QR no encontrado');
        if (qrCode.status !== QrCodeStatus.AVAILABLE) {
            throw new BadRequestException('Este QR ya está asignado o no está disponible. Usa reasignar.');
        }
        return this.createAssignment(qrCode, dto, adminUserId);
    }

    async reassign(id: string, dto: AssignQrDto, adminUserId: string) {
        const qrCode = await this.qrCodesRepository.findOne({ where: { id } });
        if (!qrCode) throw new NotFoundException('QR no encontrado');
        if (qrCode.status !== QrCodeStatus.ASSIGNED) {
            throw new BadRequestException('Este QR no tiene una asignación activa para reasignar.');
        }

        await this.assignmentsRepository.update(
            { qrCodeId: id, unassignedAt: IsNull() },
            { unassignedAt: new Date() },
        );

        return this.createAssignment(qrCode, dto, adminUserId);
    }

    async unassign(id: string, adminUserId: string, reason?: string) {
        const qrCode = await this.qrCodesRepository.findOne({ where: { id } });
        if (!qrCode) throw new NotFoundException('QR no encontrado');

        await this.assignmentsRepository.update(
            { qrCodeId: id, unassignedAt: IsNull() },
            { unassignedAt: new Date(), reason: reason ?? undefined },
        );

        qrCode.status = QrCodeStatus.AVAILABLE;
        return this.qrCodesRepository.save(qrCode);
    }

    async setStatus(id: string, status: QrCodeStatus.SUSPENDED | QrCodeStatus.DISABLED) {
        const qrCode = await this.qrCodesRepository.findOne({ where: { id } });
        if (!qrCode) throw new NotFoundException('QR no encontrado');
        qrCode.status = status;
        return this.qrCodesRepository.save(qrCode);
    }

    async activate(id: string) {
        const qrCode = await this.qrCodesRepository.findOne({ where: { id } });
        if (!qrCode) throw new NotFoundException('QR no encontrado');

        const activeAssignment = await this.assignmentsRepository.findOne({
            where: { qrCodeId: id, unassignedAt: IsNull() },
        });
        qrCode.status = activeAssignment ? QrCodeStatus.ASSIGNED : QrCodeStatus.AVAILABLE;
        return this.qrCodesRepository.save(qrCode);
    }

    async resolveByToken(token: string) {
        const qrCode = await this.qrCodesRepository.findOne({ where: { token } });
        if (!qrCode) {
            return { error: 'NOT_FOUND' as const };
        }

        if (qrCode.status === QrCodeStatus.SUSPENDED || qrCode.status === QrCodeStatus.DISABLED) {
            await this.recordScan(qrCode.id, null, null);
            return { error: 'UNAVAILABLE' as const };
        }

        const assignment = await this.assignmentsRepository.findOne({
            where: { qrCodeId: qrCode.id, unassignedAt: IsNull() },
        });

        if (!assignment) {
            await this.recordScan(qrCode.id, null, null);
            return { error: 'NOT_ASSIGNED' as const };
        }

        await this.recordScan(qrCode.id, assignment.id, assignment.placeId);

        return {
            destinationType: assignment.destinationType,
            destinationUrl: assignment.destinationUrl,
            placeId: assignment.placeId,
            qrCodeId: qrCode.id,
        };
    }

    private async recordScan(qrCodeId: string, assignmentId: string | null, placeId: string | null) {
        await this.scansRepository.save(
            this.scansRepository.create({ qrCodeId, assignmentId, placeId }),
        );
    }
}

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';
import { PaginatedResponse } from '../../common/dto/pagination.dto';

@Injectable()
export class AuditLogService {
    private readonly logger = new Logger(AuditLogService.name);

    constructor(
        @InjectRepository(AuditLog)
        private auditLogRepo: Repository<AuditLog>,
    ) {}

    async log(params: {
        action: string;
        entityType?: string;
        entityId?: string;
        metadata?: any;
        placeId?: string;
        userId?: string;
        ipAddress?: string;
        description?: string;
    }): Promise<AuditLog> {
        try {
            const log = this.auditLogRepo.create({
                action: params.action,
                entityType: params.entityType,
                entityId: params.entityId,
                metadata: params.metadata || null,
                placeId: params.placeId || null,
                userId: params.userId || null,
                ipAddress: params.ipAddress || null,
                description: params.description || null,
            });
            return await this.auditLogRepo.save(log);
        } catch (err) {
            this.logger.error(`Failed to create audit log: ${err.message}`);
            return null;
        }
    }

    async findAll(query: QueryAuditLogDto): Promise<PaginatedResponse<AuditLog>> {
        const { page, placeId, action, entityType, from, to } = query;
        const size = query.limitOrSize;
        const skip = (page - 1) * size;

        const where: any = {};

        if (placeId) where.placeId = placeId;
        if (action) where.action = action;
        if (entityType) where.entityType = entityType;
        if (from || to) {
            const createdAt: any = {};
            if (from) createdAt.gte = new Date(from);
            if (to) createdAt.lte = new Date(to);
            where.createdAt = createdAt;
        }

        const [data, total] = await this.auditLogRepo.findAndCount({
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
}

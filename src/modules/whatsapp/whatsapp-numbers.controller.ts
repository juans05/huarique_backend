import { Controller, Post, Get, Delete, Param, Body, UseGuards, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Place } from '../places/entities/place.entity';
import { WhatsAppNumber } from './entities/whatsapp-number.entity';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

// PlazBot no expone un endpoint REST para registrar webhooks (confirmado en
// docs/plazbot-pendientes.md tras revisar su openapi.json completo — solo existe
// como comando CLI). Hay que pegarla a mano en su dashboard/CLI.
function getPlazbotWebhookUrl(): string {
    const base = process.env.BACKEND_URL || 'https://backendwarike-production.up.railway.app';
    return `${base}/api/webhooks/plazbot`;
}

// Meta/PlazBot mandan el número del webhook entrante solo con dígitos (sin "+" ni espacios) —
// si acá se guarda con otro formato, la búsqueda por match exacto en el webhook nunca encuentra la fila.
function normalizePhone(phoneNumber: string): string {
    return (phoneNumber || '').replace(/\D/g, '');
}

@UseGuards(JwtAuthGuard)
@Controller('business/whatsapp-numbers')
export class WhatsAppNumbersController {
    constructor(
        @InjectRepository(WhatsAppNumber)
        private whatsappNumberRepo: Repository<WhatsAppNumber>,
        @InjectRepository(Place)
        private placesRepo: Repository<Place>,
    ) { }

    private async assertOwner(placeId: string, userId: string) {
        const place = await this.placesRepo.findOne({ where: { id: placeId } });
        if (!place) throw new NotFoundException('Local no encontrado');
        if (place.claimedByUserId !== userId) throw new ForbiddenException('No tienes permiso para gestionar este local');
    }

    @Post()
    async createWhatsAppNumber(@CurrentUser() user: any, @Body() data: any) {
        await this.assertOwner(data.placeId, user.id);
        const number = this.whatsappNumberRepo.create({
            placeId: data.placeId,
            phoneNumber: normalizePhone(data.phoneNumber),
            phoneNumberId: data.phoneNumberId,
            whatsappApiToken: data.whatsappApiToken,
            isActive: true,
            verificationStatus: 'UNVERIFIED',
        });

        const saved = await this.whatsappNumberRepo.save(number);

        return {
            id: saved.id,
            phoneNumber: saved.phoneNumber,
            webhookUrl: getPlazbotWebhookUrl(),
            status: 'Número registrado. Configura el webhook manualmente en el dashboard de PlazBot.',
        };
    }

    @Get(':placeId')
    async getWhatsAppNumbers(@CurrentUser() user: any, @Param('placeId') placeId: string) {
        await this.assertOwner(placeId, user.id);
        const numbers = await this.whatsappNumberRepo.find({
            where: { placeId },
            order: { createdAt: 'DESC' },
        });

        return {
            data: numbers.map(n => ({
                id: n.id,
                phoneNumber: n.phoneNumber,
                phoneNumberId: n.phoneNumberId,
                isActive: n.isActive,
                verificationStatus: n.verificationStatus,
                createdAt: n.createdAt,
            })),
            total: numbers.length,
            webhookUrl: getPlazbotWebhookUrl(),
        };
    }

    @Delete(':numberId')
    async deleteWhatsAppNumber(@Param('numberId') numberId: string) {
        await this.whatsappNumberRepo.delete({ id: numberId });
        return { message: 'Número de WhatsApp eliminado' };
    }
}

/**
 * Gestión del número de WhatsApp por parte del superAdmin, para cualquier local
 * (a diferencia de WhatsAppNumbersController, que solo permite al dueño gestionar el suyo).
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/whatsapp-numbers')
export class AdminWhatsAppNumbersController {
    constructor(
        @InjectRepository(WhatsAppNumber)
        private whatsappNumberRepo: Repository<WhatsAppNumber>,
        @InjectRepository(Place)
        private placesRepo: Repository<Place>,
    ) { }

    @Post()
    async createWhatsAppNumber(@Body() data: any) {
        const place = await this.placesRepo.findOne({ where: { id: data.placeId } });
        if (!place) throw new NotFoundException('Local no encontrado');

        const number = this.whatsappNumberRepo.create({
            placeId: data.placeId,
            phoneNumber: normalizePhone(data.phoneNumber),
            phoneNumberId: data.phoneNumberId,
            whatsappApiToken: data.whatsappApiToken,
            isActive: true,
            verificationStatus: 'UNVERIFIED',
        });

        const saved = await this.whatsappNumberRepo.save(number);

        return {
            id: saved.id,
            phoneNumber: saved.phoneNumber,
            webhookUrl: getPlazbotWebhookUrl(),
            status: 'Número registrado. Configura el webhook manualmente en el dashboard de PlazBot.',
        };
    }

    @Get(':placeId')
    async getWhatsAppNumbers(@Param('placeId') placeId: string) {
        const numbers = await this.whatsappNumberRepo.find({
            where: { placeId },
            order: { createdAt: 'DESC' },
        });

        return {
            data: numbers.map(n => ({
                id: n.id,
                phoneNumber: n.phoneNumber,
                phoneNumberId: n.phoneNumberId,
                isActive: n.isActive,
                verificationStatus: n.verificationStatus,
                createdAt: n.createdAt,
            })),
            total: numbers.length,
            webhookUrl: getPlazbotWebhookUrl(),
        };
    }

    @Delete(':numberId')
    async deleteWhatsAppNumber(@Param('numberId') numberId: string) {
        await this.whatsappNumberRepo.delete({ id: numberId });
        return { message: 'Número de WhatsApp eliminado' };
    }
}

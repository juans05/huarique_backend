import { Controller, Post, Get, Patch, Delete, Param, Body, UseGuards, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Place } from '../places/entities/place.entity';
import { WhatsAppNumber } from './entities/whatsapp-number.entity';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { WhatsAppCloudService } from '../messaging/whatsapp-cloud.service';
import { MetaConnectService } from './meta-connect.service';

// PlazBot no expone un endpoint REST para registrar webhooks (confirmado en
// docs/plazbot-pendientes.md tras revisar su openapi.json completo — solo existe
// como comando CLI). Hay que pegarla a mano en su dashboard/CLI.
// URL que se pega en el panel de Meta (WhatsApp → Configuración → Webhook) para recibir mensajes directo.
function getMetaWebhookUrl(): string {
    const base = process.env.BACKEND_URL || 'https://backendwarike-production.up.railway.app';
    return `${base}/api/business/webhooks/whatsapp`;
}

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
                provider: n.provider,
                isActive: n.isActive,
                verificationStatus: n.verificationStatus,
                createdAt: n.createdAt,
            })),
            total: numbers.length,
            webhookUrl: getPlazbotWebhookUrl(),
        };
    }

    // Antes cualquier usuario con sesión podía borrar el número de otro local. Ahora solo el dueño del
    // local, y solo los números conectados con Facebook: los demás los gestiona el administrador.
    @Delete(':numberId')
    async deleteWhatsAppNumber(@CurrentUser() user: any, @Param('numberId') numberId: string) {
        const number = await this.whatsappNumberRepo.findOne({ where: { id: numberId } });
        if (!number) throw new NotFoundException('Número no encontrado');
        await this.assertOwner(number.placeId, user.id);
        if (number.provider !== 'meta') {
            throw new ForbiddenException('Este número lo gestiona el administrador de Wuarikes.');
        }
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
        private cloud: WhatsAppCloudService,
        private metaConnect: MetaConnectService,
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
            provider: data.provider === 'meta' ? 'meta' : 'plazbot',
            wabaId: data.wabaId ?? null,
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
                provider: n.provider,
                isActive: n.isActive,
                verificationStatus: n.verificationStatus,
                createdAt: n.createdAt,
            })),
            total: numbers.length,
            webhookUrl: getPlazbotWebhookUrl(),
            metaWebhookUrl: getMetaWebhookUrl(),
        };
    }

    // Conecta directo con Meta un número que ya existe en la API (token de usuario del sistema; no se guarda en el chat ni en logs).
    @Post('connect-existing')
    async connectExisting(@Body() body: { placeId?: string; phoneNumberId?: string; wabaId?: string; token?: string }) {
        const { placeId, phoneNumberId, wabaId, token } = body ?? {};
        if (!placeId || !phoneNumberId || !wabaId || !token) {
            throw new BadRequestException('placeId, phoneNumberId, wabaId y token son requeridos');
        }
        return this.metaConnect.connectExisting({ placeId, phoneNumberId: phoneNumberId.trim(), wabaId: wabaId.trim(), token: token.trim() });
    }

    // Cambia qué proveedor entrega los mensajes de un número: se migra número por número.
    @Patch(':numberId/provider')
    async setProvider(@Param('numberId') numberId: string, @Body() body: { provider?: string }) {
        if (body?.provider !== 'meta' && body?.provider !== 'plazbot') {
            throw new BadRequestException("provider debe ser 'meta' o 'plazbot'");
        }
        const number = await this.whatsappNumberRepo.findOne({ where: { id: numberId } });
        if (!number) throw new NotFoundException('Número no encontrado');
        number.provider = body.provider;
        await this.whatsappNumberRepo.save(number);
        return { id: number.id, provider: number.provider };
    }

    // Envía un mensaje de prueba por la API de WhatsApp Cloud: sirve para comprobar la
    // conexión y para grabar el video que pide Meta en la revisión de la app.
    @Post('test-message')
    async sendTestMessage(@Body() body: { to?: string; text?: string; whatsappNumberId?: string }) {
        const to = normalizePhone(body?.to || '');
        const text = (body?.text || '').trim();
        if (!to || !text) throw new BadRequestException('to y text son requeridos');

        let phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
        let token: string | null = null;
        if (body.whatsappNumberId) {
            const number = await this.whatsappNumberRepo.findOne({ where: { id: body.whatsappNumberId } });
            if (!number) throw new NotFoundException('Número no encontrado');
            phoneNumberId = number.phoneNumberId;
            token = number.whatsappApiToken;
        }
        if (!phoneNumberId) throw new BadRequestException('Elige un número o define WHATSAPP_PHONE_NUMBER_ID en el servidor');

        const messageId = await this.cloud.sendText({ phoneNumberId, whatsappApiToken: token }, to, text);
        return { sent: true, messageId, to };
    }

    @Delete(':numberId')
    async deleteWhatsAppNumber(@Param('numberId') numberId: string) {
        await this.whatsappNumberRepo.delete({ id: numberId });
        return { message: 'Número de WhatsApp eliminado' };
    }
}

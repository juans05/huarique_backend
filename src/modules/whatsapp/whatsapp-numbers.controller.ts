import { Controller, Post, Get, Delete, Param, Body, UseGuards, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsAppNumber } from './entities/whatsapp-number.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlazBotService } from '../plazbot/plazbot.service';

@UseGuards(JwtAuthGuard)
@Controller('business/whatsapp-numbers')
export class WhatsAppNumbersController {
    private readonly logger = new Logger(WhatsAppNumbersController.name);

    constructor(
        @InjectRepository(WhatsAppNumber)
        private whatsappNumberRepo: Repository<WhatsAppNumber>,
        private plazbotService: PlazBotService,
    ) { }

    @Post()
    async createWhatsAppNumber(@Body() data: any) {
        const number = this.whatsappNumberRepo.create({
            placeId: data.placeId,
            phoneNumber: data.phoneNumber,
            phoneNumberId: data.phoneNumberId,
            whatsappApiToken: data.whatsappApiToken,
            isActive: true,
            verificationStatus: 'UNVERIFIED',
        });

        const saved = await this.whatsappNumberRepo.save(number);

        // Registrar webhook en PlazBot automáticamente
        const apiKey = process.env.PLAZBOT_API_KEY;
        const workspaceId = process.env.PLAZBOT_WORKSPACE_ID;

        if (apiKey && workspaceId) {
            try {
                await this.plazbotService.registerWebhook(apiKey, workspaceId, saved.phoneNumber);
                this.logger.log(`Webhook PlazBot registrado para ${saved.phoneNumber}`);
            } catch (err) {
                // No bloquear el registro del número si falla el webhook
                this.logger.error(`Error registrando webhook en PlazBot para ${saved.phoneNumber}:`, err.message);
            }
        } else {
            this.logger.warn('PLAZBOT_API_KEY o PLAZBOT_WORKSPACE_ID no configurados — webhook no registrado');
        }

        return {
            id: saved.id,
            phoneNumber: saved.phoneNumber,
            status: 'Número registrado. Webhook configurado en PlazBot automáticamente.',
        };
    }

    @Get(':placeId')
    async getWhatsAppNumbers(@Param('placeId') placeId: string) {
        console.log('----------------------->', placeId);
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
        };
    }

    @Post(':numberId/register-webhook')
    async registerWebhook(@Param('numberId') numberId: string) {
        const number = await this.whatsappNumberRepo.findOne({ where: { id: numberId } });

        if (!number) {
            return { error: 'Número no encontrado' };
        }

        const apiKey = process.env.PLAZBOT_API_KEY;
        const workspaceId = process.env.PLAZBOT_WORKSPACE_ID;

        if (!apiKey || !workspaceId) {
            return { error: 'PLAZBOT_API_KEY o PLAZBOT_WORKSPACE_ID no configurados' };
        }

        await this.plazbotService.registerWebhook(apiKey, workspaceId, number.phoneNumber);
        return { message: `Webhook re-registrado para ${number.phoneNumber}` };
    }

    @Delete(':numberId')
    async deleteWhatsAppNumber(@Param('numberId') numberId: string) {
        await this.whatsappNumberRepo.delete({ id: numberId });
        return { message: 'Número de WhatsApp eliminado' };
    }
}

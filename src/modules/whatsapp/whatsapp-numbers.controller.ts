import { Controller, Post, Get, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsAppNumber } from './entities/whatsapp-number.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('business/whatsapp-numbers')
export class WhatsAppNumbersController {
    constructor(
        @InjectRepository(WhatsAppNumber)
        private whatsappNumberRepo: Repository<WhatsAppNumber>
    ) {}

    // Create WhatsApp number
    @Post()
    async createWhatsAppNumber(@Body() data: any) {
        const number = this.whatsappNumberRepo.create({
            placeId: data.placeId,
            phoneNumber: data.phoneNumber,
            phoneNumberId: data.phoneNumberId,
            whatsappApiToken: data.whatsappApiToken,
            isActive: true,
            verificationStatus: 'UNVERIFIED'
        });

        const saved = await this.whatsappNumberRepo.save(number);

        return {
            id: saved.id,
            phoneNumber: saved.phoneNumber,
            status: 'Número registrado. Pendiente verificación con Meta.'
        };
    }

    // List WhatsApp numbers for a place
    @Get(':placeId')
    async getWhatsAppNumbers(@Param('placeId') placeId: string) {
        const numbers = await this.whatsappNumberRepo.find({
            where: { placeId },
            order: { createdAt: 'DESC' }
        });

        return {
            data: numbers.map(n => ({
                id: n.id,
                phoneNumber: n.phoneNumber,
                phoneNumberId: n.phoneNumberId,
                isActive: n.isActive,
                verificationStatus: n.verificationStatus,
                createdAt: n.createdAt
            })),
            total: numbers.length
        };
    }

    // Delete WhatsApp number
    @Delete(':numberId')
    async deleteWhatsAppNumber(@Param('numberId') numberId: string) {
        await this.whatsappNumberRepo.delete({ id: numberId });
        return { message: 'Número de WhatsApp eliminado' };
    }
}

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsAppTemplate } from './entities/whatsapp-template.entity';
import { PlazBotAdvancedService } from '../plazbot/plazbot-advanced.service';

export interface CreateTemplateDto {
    elementName: string;
    category: string;
    languageCode: string;
    headerText?: string;
    body: string;
    footer?: string;
    quickReplies?: { text: string }[];
    ctaButtons?: { text: string; type: string; value: string }[];
    variableSamples?: Record<number, { value: string; type: string }>;
}

@Injectable()
export class WhatsAppTemplateService {
    private readonly logger = new Logger(WhatsAppTemplateService.name);

    constructor(
        @InjectRepository(WhatsAppTemplate)
        private templateRepo: Repository<WhatsAppTemplate>,
        private plazBotAdvanced: PlazBotAdvancedService,
    ) {}

    async createAndSubmit(dto: CreateTemplateDto): Promise<WhatsAppTemplate> {
        this.logger.log(`[createAndSubmit] name=${dto.elementName} category=${dto.category}`);

        // 1. Guardar en DB con estado PENDING
        let template = await this.templateRepo.findOne({ where: { name: dto.elementName } });
        if (!template) {
            template = this.templateRepo.create({
                name: dto.elementName,
                category: dto.category,
                languageCode: dto.languageCode,
                headerText: dto.headerText || null,
                body: dto.body,
                footer: dto.footer || null,
                buttons: [
                    ...(dto.quickReplies || []).filter(q => q.text),
                    ...(dto.ctaButtons || []).filter(c => c.text),
                ],
                variableSamples: dto.variableSamples || null,
                status: 'PENDING',
            });
            template = await this.templateRepo.save(template);
            this.logger.log(`[createAndSubmit] Guardada en DB id=${template.id}`);
        } else {
            // Si ya existe, resetear para reenvío
            template.status = 'PENDING';
            template.errorMessage = null;
            template = await this.templateRepo.save(template);
            this.logger.log(`[createAndSubmit] Reusando existente id=${template.id}, reintentando envío`);
        }

        // 2. Intentar enviar a PlazBot
        return this.submitToPlazBot(template, dto);
    }

    async resend(id: string): Promise<WhatsAppTemplate> {
        const template = await this.templateRepo.findOne({ where: { id } });
        if (!template) throw new NotFoundException(`Template ${id} no encontrado`);

        this.logger.log(`[resend] id=${id} name=${template.name} status=${template.status}`);

        const dto: CreateTemplateDto = {
            elementName: template.name,
            category: template.category,
            languageCode: template.languageCode,
            headerText: template.headerText || undefined,
            body: template.body,
            footer: template.footer || undefined,
            variableSamples: template.variableSamples || undefined,
        };

        template.status = 'PENDING';
        template.errorMessage = null;
        await this.templateRepo.save(template);

        return this.submitToPlazBot(template, dto);
    }

    async syncStatuses(): Promise<WhatsAppTemplate[]> {
        this.logger.log(`[syncStatuses] Sincronizando estados desde PlazBot`);
        const { apiKey, workspaceId } = this.getGlobalCreds();

        const approved = await this.plazBotAdvanced.listActiveTemplates(apiKey, workspaceId);
        const approvedNames = new Set(approved.map((t: any) => t.elementName || t.name));

        this.logger.log(`[syncStatuses] Plantillas aprobadas en PlazBot: ${approvedNames.size}`);

        // Actualizar las que están en SUBMITTED y ahora están aprobadas
        const submitted = await this.templateRepo.find({ where: { status: 'SUBMITTED' } });
        for (const t of submitted) {
            if (approvedNames.has(t.name)) {
                t.status = 'APPROVED';
                await this.templateRepo.save(t);
                this.logger.log(`[syncStatuses] Aprobada: ${t.name}`);
            }
        }

        // También marcar PENDING sin error que estén en PlazBot como APPROVED directamente
        const pending = await this.templateRepo.find({ where: { status: 'PENDING' } });
        for (const t of pending) {
            if (approvedNames.has(t.name)) {
                t.status = 'APPROVED';
                await this.templateRepo.save(t);
            }
        }

        return this.templateRepo.find({ order: { createdAt: 'DESC' } });
    }

    async findAll(): Promise<WhatsAppTemplate[]> {
        return this.templateRepo.find({ order: { createdAt: 'DESC' } });
    }

    private async submitToPlazBot(template: WhatsAppTemplate, dto: CreateTemplateDto): Promise<WhatsAppTemplate> {
        const { apiKey, workspaceId } = this.getGlobalCreds();
        try {
            const result = await this.plazBotAdvanced.createTemplate(apiKey, workspaceId, dto);
            template.status = 'SUBMITTED';
            template.plazbotResponse = result;
            template.plazbotTemplateId = result?.id || result?.templateId || null;
            template.errorMessage = null;
            this.logger.log(`[submitToPlazBot] Enviada exitosamente name=${template.name}`);
        } catch (err: any) {
            template.status = 'FAILED';
            template.errorMessage = err?.message || 'Error desconocido al enviar a PlazBot';
            template.plazbotResponse = null;
            this.logger.error(`[submitToPlazBot] Error al enviar name=${template.name}: ${template.errorMessage}`);
        }
        return this.templateRepo.save(template);
    }

    private getGlobalCreds() {
        return {
            apiKey: process.env.PLAZBOT_API_KEY || '',
            workspaceId: process.env.PLAZBOT_WORKSPACE_ID || '',
        };
    }
}

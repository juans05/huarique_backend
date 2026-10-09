import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PlaceTeamService } from '../team/place-team.service';
import { WhatsAppTemplatesService } from './whatsapp-templates.service';
import { CreateTemplateInput } from './whatsapp-templates.util';

@UseGuards(JwtAuthGuard)
@Controller('business/whatsapp/templates')
export class WhatsAppTemplatesController {
    constructor(
        private readonly templates: WhatsAppTemplatesService,
        private readonly team: PlaceTeamService,
    ) {}

    /** Plantillas de la cuenta de WhatsApp del local, con su estado de aprobación en Meta. */
    @Get()
    async list(@CurrentUser() user: any, @Query('placeId') placeId: string) {
        if (!placeId) throw new BadRequestException('placeId es requerido');
        await this.team.assertAccess(user.id, placeId, 'ia_total');
        return { data: await this.templates.list(placeId) };
    }

    /** Crea una plantilla y la envía a aprobación de Meta (suele tardar de minutos a 24 h). */
    @Post()
    async create(@CurrentUser() user: any, @Body() body: Partial<CreateTemplateInput> & { placeId?: string }) {
        if (!body?.placeId) throw new BadRequestException('placeId es requerido');
        await this.team.assertAccess(user.id, body.placeId, 'ia_total');
        const { placeId, ...input } = body;
        return this.templates.create(placeId, {
            name: input.name ?? '',
            language: input.language ?? 'es',
            category: (input.category as any) ?? 'MARKETING',
            body: input.body ?? '',
            bodyExamples: input.bodyExamples,
            footer: input.footer,
        });
    }
}

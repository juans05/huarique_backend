import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { WhatsAppNumber } from '../whatsapp/entities/whatsapp-number.entity';
import { Place } from '../places/entities/place.entity';
import { isMetaEnabled } from './meta-flag';
import { buildCreateTemplatePayload, CreateTemplateInput, validateTemplateInput } from './whatsapp-templates.util';

export interface MetaTemplate {
    id: string;
    name: string;
    language: string;
    category: string;
    status: string;
    body: string;
    variableCount: number;
}

/** Plantillas de mensajes directo en la cuenta de WhatsApp Business del local (API de Meta). No toca PlazBot. */
@Injectable()
export class WhatsAppTemplatesService {
    constructor(
        @InjectRepository(WhatsAppNumber) private readonly numbers: Repository<WhatsAppNumber>,
        @InjectRepository(Place) private readonly places: Repository<Place>,
    ) {}

    private get graph() {
        return `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION || 'v20.0'}`;
    }

    /** Número del local conectado por Meta (con su cuenta WABA y token): de ahí salen y se crean las plantillas. */
    private async metaNumber(placeId: string): Promise<WhatsAppNumber> {
        const place = await this.places.findOne({ where: { id: placeId } });
        if (!isMetaEnabled(place)) throw new BadRequestException('Activa primero la conexión con Facebook (Meta) para este local.');
        const number = await this.numbers.findOne({ where: { placeId, provider: 'meta', isActive: true }, order: { createdAt: 'DESC' } });
        if (!number?.wabaId) throw new BadRequestException('Este local todavía no tiene un número conectado con Meta.');
        return number;
    }

    private token(n: WhatsAppNumber) {
        const token = n.whatsappApiToken || process.env.WHATSAPP_API_TOKEN;
        if (!token) throw new BadGatewayException('Falta el token de acceso de WhatsApp.');
        return token;
    }

    async list(placeId: string): Promise<MetaTemplate[]> {
        const n = await this.metaNumber(placeId);
        try {
            const { data } = await axios.get(`${this.graph}/${n.wabaId}/message_templates`, {
                params: { fields: 'name,language,status,category,components', limit: 100 },
                headers: { Authorization: `Bearer ${this.token(n)}` },
                timeout: 20000,
            });
            return (data?.data ?? []).map((t: any) => {
                const body = (t.components ?? []).find((c: any) => c.type === 'BODY')?.text ?? '';
                const nums = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((m: RegExpMatchArray) => Number(m[1]));
                return { id: t.id, name: t.name, language: t.language, category: t.category, status: t.status, body, variableCount: nums.length ? Math.max(...nums) : 0 };
            });
        } catch (err: any) {
            throw new BadGatewayException(`Meta respondió con error: ${err?.response?.data?.error?.message || err?.message}`);
        }
    }

    async create(placeId: string, input: CreateTemplateInput) {
        const problem = validateTemplateInput(input);
        if (problem) throw new BadRequestException(problem);
        const n = await this.metaNumber(placeId);
        try {
            const { data } = await axios.post(`${this.graph}/${n.wabaId}/message_templates`, buildCreateTemplatePayload(input), {
                headers: { Authorization: `Bearer ${this.token(n)}` },
                timeout: 20000,
            });
            return { id: data?.id, status: data?.status ?? 'PENDING' };
        } catch (err: any) {
            throw new BadGatewayException(`Meta rechazó la plantilla: ${err?.response?.data?.error?.error_user_msg || err?.response?.data?.error?.message || err?.message}`);
        }
    }
}

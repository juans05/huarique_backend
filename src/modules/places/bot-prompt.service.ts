import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Place } from './entities/place.entity';
import { AiService } from '../ai/ai.service';
import { MenuFormatterService } from './menu-formatter.service';
import { BUSINESS_TYPES, DEFAULT_BUSINESS_TYPE, getVerticalConfig } from './business-types';

// El prompt sugerido describe al bot; el catálogo y la Base IA ya le llegan aparte en cada conversación, así que aquí
// solo se mandan recortados para que el modelo entienda el negocio.
const CATALOG_MAX = 3000;
const KNOWLEDGE_MAX = 6000;

type Hours = { day: string; isOpen?: boolean; openTime?: string; closeTime?: string }[];

export interface BotPromptFacts {
    name: string;
    typeLabel: string;
    persona: string;
    customer: string;
    catalog: string;
    can: string[];
    specialty: string | null;
    amenities: string[];
    tags: string[];
    description: string | null;
    location: string | null;
    hours: string | null;
    prices: string | null;
    phone: string | null;
    website: string | null;
    catalogText: string;
    knowledgeText: string;
}

/** "Lunes 19:00–23:00; Domingo cerrado" desde el JSON de open_hours_text (null si no hay o no se entiende). */
export function hoursLine(openHoursText: string | null): string | null {
    if (!openHoursText) return null;
    try {
        const days = JSON.parse(openHoursText) as Hours;
        if (!Array.isArray(days) || !days.length) return null;
        return days.map((d) => (d.isOpen === false ? `${d.day} cerrado` : `${d.day} ${d.openTime ?? '?'}–${d.closeTime ?? '?'}`)).join('; ');
    } catch {
        return openHoursText.trim() || null; // texto libre de locales antiguos
    }
}

/** Instrucciones para el modelo: solo los datos que existen, sin inventar el resto. */
export function botPromptRequest(f: BotPromptFacts) {
    const line = (label: string, value: string | null | undefined) => (value ? `${label}: ${value}\n` : '');
    const data =
        line('Nombre', f.name) +
        line('Tipo de negocio', f.typeLabel) +
        line('Especialidad', f.specialty) +
        line('Comodidades', f.amenities.join(', ')) +
        line('Etiquetas', f.tags.join(', ')) +
        line('Descripción', f.description) +
        line('Ubicación', f.location) +
        line('Horario', f.hours) +
        line('Rango de precios', f.prices) +
        line('Teléfono', f.phone) +
        line('Web', f.website) +
        line('El bot puede ayudar a', f.can.join('; ')) +
        (f.catalogText ? `\n${f.catalog} (extracto):\n${f.catalogText}\n` : '') +
        (f.knowledgeText ? `\nBase IA del negocio (documentos que subió el dueño, extracto):\n${f.knowledgeText}\n` : '');

    return [
        {
            role: 'system' as const,
            content: 'Eres experto en configurar asistentes de WhatsApp para negocios peruanos. Responde SOLO con el texto del system prompt, sin explicaciones, títulos ni comillas.',
        },
        {
            role: 'user' as const,
            content: `Escribe el system prompt (instrucciones) en español peruano para el ${f.persona} "${f.name}" (${f.typeLabel}), que atiende a sus ${f.customer.toLowerCase()}s por WhatsApp.

Datos reales del negocio:
${data}
El prompt debe:
- Empezar con "Eres el asistente de ${f.name}" y describir el negocio con su tipo${f.specialty ? ', su especialidad' : ''}${f.amenities.length ? ' y sus comodidades' : ''}.
- Indicar en qué ayuda el bot (solo lo de "El bot puede ayudar a") y cómo invitar al ${f.customer.toLowerCase()} a dar el siguiente paso.
- Incluir los datos útiles que sí existen (horario, ubicación, comodidades, lo distintivo de la Base IA) como hechos que el bot puede repetir.
- Dar el tono: cercano, amable y breve, como se escribe por WhatsApp en Perú; tutear salvo que la Base IA indique otra cosa.
- Prohibir inventar precios, horarios, servicios o promociones que no estén en sus datos; si no sabe algo, ofrecer pasar con una persona del equipo.
- No copiar el ${f.catalog.toLowerCase()} completo: el bot lo recibe aparte con precios actualizados.
- Tener entre 120 y 250 palabras, en párrafos cortos o viñetas.`,
        },
    ];
}

@Injectable()
export class BotPromptService {
    constructor(
        @InjectRepository(Place) private placesRepo: Repository<Place>,
        private dataSource: DataSource,
        private aiService: AiService,
        private menuFormatter: MenuFormatterService,
    ) { }

    async facts(placeId: string): Promise<BotPromptFacts> {
        const place = await this.placesRepo.findOne({ where: { id: placeId }, relations: ['category', 'amenities', 'tags', 'district'] });
        if (!place) throw new NotFoundException('Local no encontrado');
        const businessType = place.businessType || DEFAULT_BUSINESS_TYPE;
        const vertical = getVerticalConfig(businessType);
        const modules = new Set(vertical.modules);
        const catalog = vertical.labels.catalog;

        const can = [
            modules.has('carta') && `consultar ${catalog.toLowerCase()} y precios`,
            modules.has('agenda') && 'reservar, cambiar o cancelar citas',
            modules.has('pedidos') && 'hacer pedidos',
            modules.has('mesas') && 'reservar mesa',
            'resolver dudas sobre horarios, ubicación y formas de pago',
        ].filter(Boolean) as string[];

        const [catalogText, chunks] = await Promise.all([
            this.menuFormatter.formatMenuToMarkdown(placeId, businessType),
            this.dataSource.query(
                `SELECT c.chunk_text FROM wuarike_db.knowledge_base_chunks c
                 JOIN wuarike_db.knowledge_bases kb ON kb.id = c.knowledge_base_id
                 WHERE kb.place_id = $1 ORDER BY kb.created_at LIMIT 40`,
                [placeId],
            ) as Promise<{ chunk_text: string }[]>,
        ]);

        const district = place.district ? [place.district.district, place.district.province].filter(Boolean).join(', ') : null;
        const priceMin = place.priceMin != null ? Number(place.priceMin) : null;
        const priceMax = place.priceMax != null ? Number(place.priceMax) : null;
        return {
            name: place.name,
            typeLabel: BUSINESS_TYPES[businessType]?.label ?? vertical.label,
            persona: vertical.botPersona,
            customer: vertical.labels.customer,
            catalog,
            can,
            specialty: place.category?.name ?? null,
            amenities: (place.amenities ?? []).map((a) => a.name),
            tags: (place.tags ?? []).map((t) => t.name),
            description: place.description?.trim() || null,
            location: [place.address?.trim(), district].filter(Boolean).join(', ') || null,
            hours: hoursLine(place.openHoursText),
            prices: priceMin != null || priceMax != null ? `S/ ${priceMin ?? '?'}${priceMax != null ? ` a S/ ${priceMax}` : ''}` : null,
            phone: place.phone || null,
            website: place.website || null,
            catalogText: catalogText.slice(0, CATALOG_MAX),
            knowledgeText: chunks.map((c) => c.chunk_text.trim()).join('\n---\n').slice(0, KNOWLEDGE_MAX),
        };
    }

    async suggest(placeId: string): Promise<string> {
        const text = await this.aiService.chat(botPromptRequest(await this.facts(placeId)), undefined, 1200);
        return text.trim();
    }
}

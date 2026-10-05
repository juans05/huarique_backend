import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiService } from '../ai/ai.service';
import { ImportedCategory, sanitizeMenu } from './menu-import.util';

const PROMPT =
    'Eres un transcriptor de cartas de restaurantes de Perú. Lee la carta del archivo y devuelve ÚNICAMENTE JSON: ' +
    '{"categories":[{"name":string,"categoryType":"food"|"drink"|"dessert"|"other","dishes":[{"name":string,"description":string,"price":number|null}]}]}. ' +
    'Reglas: copia nombres, descripciones y precios tal como aparecen (precios en soles, solo el número); ' +
    'si un plato no tiene precio usa null; no inventes platos ni precios; agrupa por las secciones de la carta; ' +
    'usa "drink" para bebidas, "dessert" para postres y "food" para el resto.';

@Injectable()
export class MenuImportService {
    constructor(
        private readonly aiService: AiService,
        private readonly config: ConfigService,
    ) {}

    /** Lee la foto/PDF de una carta (subida a Cloudinary) y devuelve categorías y platos para revisar. No guarda nada. */
    async parseFromFile(fileUrl: string): Promise<ImportedCategory[]> {
        let host = '';
        try {
            host = new URL(fileUrl).hostname;
        } catch {
            throw new BadRequestException('URL de archivo inválida');
        }
        // Solo archivos subidos por nuestro propio flujo de upload.
        if (host !== 'res.cloudinary.com') throw new BadRequestException('El archivo debe subirse desde el panel');

        const isPdf = /\.pdf($|\?)/i.test(fileUrl);
        const filePart = isPdf
            ? { type: 'file', file: { filename: 'carta.pdf', file_data: fileUrl } }
            : { type: 'image_url', image_url: { url: fileUrl } };

        let raw: string;
        try {
            raw = await this.aiService.chat(
                [{ role: 'user', content: [{ type: 'text', text: PROMPT }, filePart] as any }],
                this.config.get<string>('MENU_IMPORT_MODEL') || 'google/gemini-2.5-flash',
                8192,
            );
        } catch {
            throw new ServiceUnavailableException('No se pudo leer la carta con IA. Intenta de nuevo o arma la carta a mano.');
        }

        try {
            const parsed = sanitizeMenu(JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)));
            if (parsed.length === 0) throw new Error('empty');
            return parsed;
        } catch {
            throw new BadRequestException('No se encontraron platos en el archivo. Prueba con una foto más nítida.');
        }
    }
}

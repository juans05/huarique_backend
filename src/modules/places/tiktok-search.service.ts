import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { execFile } from 'child_process';
import axios from 'axios';
import { Place } from './entities/place.entity';

export interface TikTokVideo {
    url: string;
    thumbnailUrl: string | null;
    caption: string | null;
    authorName: string | null;
}

interface ScraperResult {
    results?: { videoUrl: string; caption: string }[];
    error?: string;
}

// ponytail: el scraper es Python (scrapling, necesita un navegador headless)
// y solo está instalado en este repo localmente — Railway (donde corre el
// backend en producción) es un contenedor Node puro sin Python. En
// producción esto falla rápido y limpio (spawn ENOENT) en vez de romper la
// página; para que funcione ahí también habría que agregar Python +
// Chromium al build de Railway. Upgrade path si algún día importa.
const PYTHON_PATH = process.env.TIKTOK_SCRAPER_PYTHON || 'D:/Github/wuarikes/scraper/.venv/Scripts/python.exe';
const SCRIPT_PATH = process.env.TIKTOK_SCRAPER_SCRIPT || 'D:/Github/wuarikes/scraper/search_place_tiktok.py';
const SCRAPE_TIMEOUT_MS = 60_000;

@Injectable()
export class TikTokSearchService {
    private readonly logger = new Logger(TikTokSearchService.name);

    constructor(
        @InjectRepository(Place)
        private placesRepository: Repository<Place>,
    ) { }

    async getOrSearch(placeId: string): Promise<{ videos: TikTokVideo[]; available: boolean }> {
        const place = await this.placesRepository.findOne({
            where: { id: placeId },
            relations: ['district'],
        });
        if (!place) return { videos: [], available: false };

        const cached = (place.metadata as any)?.tiktokVideos as TikTokVideo[] | undefined;
        if (cached) {
            return { videos: cached, available: true };
        }

        let scraped: { videoUrl: string; caption: string }[];
        try {
            scraped = await this.runScraper(place.name ?? '', place.district?.district ?? 'Lima');
        } catch (err) {
            this.logger.warn(`TikTok scraper no disponible: ${(err as Error).message}`);
            return { videos: [], available: false };
        }

        const videos: TikTokVideo[] = [];
        for (const r of scraped) {
            const meta = await this.fetchOembed(r.videoUrl);
            videos.push({
                url: r.videoUrl,
                thumbnailUrl: meta?.thumbnail_url ?? null,
                caption: (r.caption || meta?.title || '').slice(0, 200),
                authorName: meta?.author_name ?? null,
            });
        }

        // Se cachea aunque venga vacío ([]) para no re-scrapear en cada visita —
        // el próximo intento manual de re-búsqueda debería borrar la key primero.
        await this.placesRepository.update(placeId, {
            metadata: { ...(place.metadata ?? {}), tiktokVideos: videos },
        });

        return { videos, available: true };
    }

    private runScraper(placeName: string, district: string): Promise<{ videoUrl: string; caption: string }[]> {
        return new Promise((resolve, reject) => {
            execFile(
                PYTHON_PATH,
                [SCRIPT_PATH, placeName, district],
                { timeout: SCRAPE_TIMEOUT_MS },
                (error, stdout) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    try {
                        const parsed: ScraperResult = JSON.parse(stdout);
                        if (parsed.error) {
                            reject(new Error(parsed.error));
                            return;
                        }
                        resolve(parsed.results ?? []);
                    } catch {
                        reject(new Error('Respuesta inválida del scraper'));
                    }
                },
            );
        });
    }

    private async fetchOembed(videoUrl: string): Promise<{ thumbnail_url?: string; title?: string; author_name?: string } | null> {
        try {
            const { data } = await axios.get('https://www.tiktok.com/oembed', {
                params: { url: videoUrl },
                timeout: 10_000,
            });
            return data;
        } catch {
            return null;
        }
    }
}

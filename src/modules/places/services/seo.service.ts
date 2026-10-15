import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Place } from '../entities/place.entity';
import { Dish } from '../entities/dish.entity';
import { GoogleBusinessService } from './google-business.service';
import { GoogleMapsService } from './google-maps.service';
import { SeoInput, SeoResult, computeSeoScore } from '../seo-score.util';

const DAY = 86_400_000;
const RECALC_EVERY_MS = 10 * 60_000;
const SAVE_SEO_SQL = `UPDATE wuarike_db.places
   SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('seoScore', $2::jsonb)
 WHERE id = $1`;

export function fromBusinessProfile(
    gbp: { profile: any; mediaItems: any[]; totalMedia: number },
    rev: { reviews: any[]; total: number; averageRating: number | null },
    hasMenu: boolean,
    now = Date.now(),
): SeoInput {
    const p = gbp.profile ?? {};
    const cat = (m: any) => m.locationAssociation?.category;
    const replies = rev.reviews.map((r) => Date.parse(r.reviewReply?.updateTime ?? '')).filter(Number.isFinite);
    return {
        estimated: false,
        name: !!p.title,
        address: !!p.storefrontAddress?.addressLines?.length,
        phone: !!p.phoneNumbers?.primaryPhone,
        website: !!p.websiteUri,
        hours: !!p.regularHours?.periods?.length,
        primaryCategory: !!p.categories?.primaryCategory,
        extraCategories: p.categories?.additionalCategories?.length ?? 0,
        descriptionLength: p.profile?.description?.length ?? 0,
        rating: rev.averageRating,
        reviewCount: rev.total,
        responseRate: rev.reviews.length ? rev.reviews.filter((r) => r.reviewReply).length / rev.reviews.length : 0,
        hasCover: gbp.mediaItems.some((m) => cat(m) === 'COVER'),
        hasLogo: gbp.mediaItems.some((m) => cat(m) === 'PROFILE' || cat(m) === 'LOGO'),
        photoCount: gbp.totalMedia,
        recentPhotos90d: gbp.mediaItems.filter((m) => now - Date.parse(m.createTime) <= 90 * DAY).length,
        serviceItems: p.serviceItems?.length ?? 0,
        hasMenu,
        reviewsLast30d: rev.reviews.filter((r) => now - Date.parse(r.createTime) <= 30 * DAY).length,
        daysSinceLastReply: replies.length ? Math.floor((now - Math.max(...replies)) / DAY) : null,
    };
}

export function fromPlacesDetails(d: any, hasMenu: boolean): SeoInput {
    return {
        estimated: true,
        name: !!d?.name, address: !!d?.formatted_address, phone: !!d?.formatted_phone_number,
        website: !!d?.website, hours: !!d?.opening_hours?.periods?.length,
        primaryCategory: false, extraCategories: null, descriptionLength: null,
        rating: d?.rating ?? null, reviewCount: d?.user_ratings_total ?? 0, responseRate: null,
        hasCover: null, hasLogo: null, photoCount: d?.photos?.length ?? 0, recentPhotos90d: null, // Places devuelve máx. 10 fotos
        serviceItems: null, hasMenu, reviewsLast30d: null, daysSinceLastReply: null,
    };
}

@Injectable()
export class SeoService {
    private readonly logger = new Logger(SeoService.name);

    constructor(
        @InjectRepository(Place) private readonly placesRepo: Repository<Place>,
        private readonly google: GoogleBusinessService,
        private readonly maps: GoogleMapsService,
        @InjectRepository(Dish) private readonly dishesRepo: Repository<Dish>,
    ) {}

    async get(placeId: string): Promise<(SeoResult & { at: string }) | null> {
        const place = await this.placesRepo.findOne({ where: { id: placeId } });
        return place?.metadata?.seoScore ?? null;
    }

    async recalculate(placeId: string, now = Date.now()): Promise<SeoResult & { at: string }> {
        const place = await this.placesRepo.findOne({ where: { id: placeId } });
        const cached = place?.metadata?.seoScore;
        if (cached?.at && now - Date.parse(cached.at) < RECALC_EVERY_MS) return cached;

        const hasMenu = (await this.dishesRepo.count({ where: { placeId } })) > 0;
        let input: SeoInput | null = null;
        if (place?.googleAccessToken && place?.googleLocationName) {
            try {
                const [gbp, rev] = await Promise.all([this.google.getLocationProfile(placeId), this.google.getAllReviews(placeId)]);
                input = fromBusinessProfile(gbp, rev, hasMenu, now);
            } catch (err) {
                // Sin aprobación de la API de Business Profile (cuota 0) o token vencido: puntaje estimado con Places.
                this.logger.warn(`[seo] Business Profile no disponible para ${placeId}: ${err?.message}`);
            }
        }
        if (!input) {
            const details = place?.googlePlaceId ? await this.maps.getSeoDetails(place.googlePlaceId) : null;
            input = fromPlacesDetails(details, hasMenu);
        }
        const result = { ...computeSeoScore(input), at: new Date(now).toISOString() };
        await this.placesRepo.query(SAVE_SEO_SQL, [placeId, JSON.stringify(result)]);
        return result;
    }
}

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Places API (New). La API "legacy" (maps/api/place/*) ya no se puede activar en proyectos nuevos de Google Cloud.
const PLACES = 'https://places.googleapis.com/v1';
const LIMA = { latitude: -12.0464, longitude: -77.0428 };

/** Reseña de la API nueva con los nombres de la legacy, que es lo que guardan los que la usan. */
export function toLegacyReview(r: any) {
  return {
    author_name: r.authorAttribution?.displayName ?? 'Usuario de Google',
    profile_photo_url: r.authorAttribution?.photoUri ?? null,
    rating: r.rating,
    text: r.text?.text ?? r.originalText?.text ?? '',
    relative_time_description: r.relativePublishTimeDescription ?? null,
    time: r.publishTime ? Math.floor(Date.parse(r.publishTime) / 1000) : 0,
  };
}

@Injectable()
export class GoogleMapsService {
  private readonly logger = new Logger(GoogleMapsService.name);
  private readonly apiKey: string;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('GOOGLE_MAPS_API_KEY');
  }

  private async call(path: string, fieldMask: string, body?: Record<string, unknown>) {
    const response = await fetch(`${PLACES}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'X-Goog-Api-Key': this.apiKey, 'X-Goog-FieldMask': fieldMask, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json();
    return { ok: response.ok, status: response.status, data };
  }

  private searchText(textQuery: string, fieldMask: string, includedType?: string) {
    return this.call('/places:searchText', fieldMask, {
      textQuery, languageCode: 'es', ...(includedType ? { includedType } : {}),
      locationBias: { circle: { center: LIMA, radius: 50000 } },
    });
  }

  async getPlaceReviews(googlePlaceId: string) {
    if (!this.apiKey) {
      this.logger.warn('GOOGLE_MAPS_API_KEY not configured');
      return null;
    }

    const { ok, status, data } = await this.call(`/places/${encodeURIComponent(googlePlaceId)}?languageCode=es`, 'rating,userRatingCount,reviews');
    this.logger.log(`Google API status: ${status} | placeId: ${googlePlaceId} | reviews: ${data.reviews?.length ?? 0}`);

    if (!ok) {
      const msg = `Google API Error: ${data.error?.status ?? status} - ${data.error?.message || 'sin detalle'}`;
      this.logger.error(msg);
      // Error de configuración o de ID, no del servidor: se le explica al dueño en vez de un 500.
      if (status === 403) {
        throw new BadRequestException('Google rechazó la consulta: activa "Places API (New)" y la facturación en el proyecto de Google Cloud de la clave de Google Maps.');
      }
      if (status === 400 || status === 404) {
        throw new BadRequestException('Google no reconoce ese Place ID. Revisa que esté bien copiado.');
      }
      throw new Error(msg);
    }

    return {
      rating: data.rating,
      totalReviews: data.userRatingCount,
      reviews: (data.reviews || []).map(toLegacyReview),
    };
  }

  /**
   * Busca lugares en Google Maps (Autocomplete)
   */
  async searchPlaces(query: string) {
    if (!this.apiKey) return [];

    try {
      // Text Search de restaurantes, con preferencia por Lima.
      const { ok, data } = await this.searchText(query, 'places.id,places.displayName,places.formattedAddress', 'restaurant');
      if (!ok) {
        this.logger.error(`Google Text Search: ${data.error?.message}`);
        return [];
      }
      return (data.places || []).map((p: any) => ({
        googlePlaceId: p.id,
        name: p.displayName?.text,
        address: p.formattedAddress,
        source: 'google'
      }));
    } catch (error) {
      this.logger.error(`Error in Google Text Search: ${error.message}`);
      return [];
    }
  }

  /**
   * Obtiene detalles completos de un lugar por su Place ID
   */
  async getPlaceDetails(googlePlaceId: string) {
    if (!this.apiKey) return null;

    try {
      const { ok, data: res } = await this.call(
        `/places/${encodeURIComponent(googlePlaceId)}?languageCode=es`,
        'displayName,formattedAddress,location,nationalPhoneNumber,websiteUri,rating,userRatingCount',
      );
      if (!ok) return null;
      return {
        name: res.displayName?.text,
        address: res.formattedAddress,
        latitude: res.location?.latitude,
        longitude: res.location?.longitude,
        phone: res.nationalPhoneNumber,
        website: res.websiteUri,
        googleRating: res.rating,
        totalReviews: res.userRatingCount,
        googlePlaceId: googlePlaceId
      };
    } catch (error) {
      this.logger.error(`Error in Google Place Details: ${error.message}`);
      return null;
    }
  }

  /**
   * Intenta encontrar el Place ID a partir de un nombre y dirección
   */
  async findPlaceId(name: string, address: string) {
    if (!this.apiKey) return null;

    try {
      const { ok, data } = await this.searchText(`${name} ${address}`, 'places.id');
      return ok ? data.places?.[0]?.id ?? null : null;
    } catch (error) {
      this.logger.error(`Error finding Google Place ID: ${error.message}`);
      return null;
    }
  }
}

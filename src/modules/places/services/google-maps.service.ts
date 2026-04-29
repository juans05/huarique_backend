import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GoogleMapsService {
  private readonly logger = new Logger(GoogleMapsService.name);
  private readonly apiKey: string;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('GOOGLE_MAPS_API_KEY');
  }

  async getPlaceReviews(googlePlaceId: string) {
    if (!this.apiKey) {
      this.logger.warn('GOOGLE_MAPS_API_KEY not configured');
      return null;
    }

    try {
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${googlePlaceId}&fields=reviews,rating,user_ratings_total&key=${this.apiKey}&language=es`;
      
      const response = await fetch(url);
      const data = await response.json();

      if (data.status !== 'OK') {
        throw new Error(`Google API Error: ${data.status} - ${data.error_message || ''}`);
      }

      return {
        rating: data.result.rating,
        totalReviews: data.result.user_ratings_total,
        reviews: data.result.reviews || [],
      };
    } catch (error) {
      this.logger.error(`Error fetching Google Reviews: ${error.message}`);
      throw error;
    }
  }

  /**
   * Busca lugares en Google Maps (Autocomplete)
   */
  async searchPlaces(query: string) {
    if (!this.apiKey) return [];

    try {
      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&types=establishment&components=country:pe&key=${this.apiKey}&language=es`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.status === 'OK') {
        return data.predictions.map(p => ({
          googlePlaceId: p.place_id,
          name: p.structured_formatting.main_text,
          address: p.structured_formatting.secondary_text,
          source: 'google'
        }));
      }
      return [];
    } catch (error) {
      this.logger.error(`Error in Google Autocomplete: ${error.message}`);
      return [];
    }
  }

  /**
   * Obtiene detalles completos de un lugar por su Place ID
   */
  async getPlaceDetails(googlePlaceId: string) {
    if (!this.apiKey) return null;

    try {
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${googlePlaceId}&fields=name,formatted_address,geometry,formatted_phone_number,website,rating,user_ratings_total,types,photos&key=${this.apiKey}&language=es`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.status === 'OK') {
        const res = data.result;
        return {
          name: res.name,
          address: res.formatted_address,
          latitude: res.geometry.location.lat,
          longitude: res.geometry.location.lng,
          phone: res.formatted_phone_number,
          website: res.website,
          googleRating: res.rating,
          totalReviews: res.user_ratings_total,
          googlePlaceId: googlePlaceId
        };
      }
      return null;
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
      const query = encodeURIComponent(`${name} ${address}`);
      const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${query}&inputtype=textquery&fields=place_id&key=${this.apiKey}`;
      
      const response = await fetch(url);
      const data = await response.json();

      if (data.status === 'OK' && data.candidates?.length > 0) {
        return data.candidates[0].place_id;
      }
      return null;
    } catch (error) {
      this.logger.error(`Error finding Google Place ID: ${error.message}`);
      return null;
    }
  }
}

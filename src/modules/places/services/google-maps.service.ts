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

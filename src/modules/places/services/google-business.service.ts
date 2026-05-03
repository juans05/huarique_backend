import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Place } from '../entities/place.entity';

@Injectable()
export class GoogleBusinessService {
  private readonly logger = new Logger(GoogleBusinessService.name);

  constructor(
    private config: ConfigService,
    @InjectRepository(Place)
    private placesRepo: Repository<Place>,
  ) {}

  private get clientId() { return this.config.get<string>('GOOGLE_CLIENT_ID') || ''; }
  private get clientSecret() { return this.config.get<string>('GOOGLE_CLIENT_SECRET') || ''; }
  private get redirectUri() {
    return this.config.get<string>('GOOGLE_REDIRECT_URI') ||
      'https://backendwarike-production.up.railway.app/business/google/callback';
  }
  private get frontendUrl() {
    return this.config.get<string>('FRONTEND_URL') || 'https://warike.up.railway.app';
  }

  getAuthUrl(placeId: string, userId: string): string {
    if (!this.clientId) throw new Error('GOOGLE_CLIENT_ID no configurado en el servidor');
    const state = Buffer.from(`${placeId}|${userId}`).toString('base64');
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/business.manage',
      access_type: 'offline',
      prompt: 'consent',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  async handleCallback(code: string, state: string): Promise<string> {
    let placeId: string;
    try {
      [placeId] = Buffer.from(state, 'base64').toString().split('|');
    } catch {
      return `${this.frontendUrl}/reputacion?error=invalid_state`;
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });

    const tokens = await tokenRes.json();
    if (!tokens.access_token) {
      this.logger.error(`Token exchange failed: ${JSON.stringify(tokens)}`);
      return `${this.frontendUrl}/reputacion?error=token_failed`;
    }

    await this.placesRepo.update(placeId, {
      googleAccessToken: tokens.access_token,
      googleRefreshToken: tokens.refresh_token || null,
    });

    return `${this.frontendUrl}/reputacion?connected=true`;
  }

  async getLocations(placeId: string): Promise<any[]> {
    const accessToken = await this.getValidToken(placeId);

    const accountsRes = await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const accountsData = await accountsRes.json();

    if (accountsData.error) {
      this.logger.error(`Accounts API error: ${JSON.stringify(accountsData.error)}`);
      return [];
    }

    const locations: any[] = [];
    for (const account of (accountsData.accounts || [])) {
      const locRes = await fetch(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title,storefrontAddress`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const locData = await locRes.json();
      for (const loc of (locData.locations || [])) {
        locations.push({
          locationName: loc.name,
          title: loc.title,
          address: loc.storefrontAddress?.addressLines?.join(', ') || '',
        });
      }
    }
    return locations;
  }

  async getAllReviews(placeId: string): Promise<{ reviews: any[]; total: number }> {
    const place = await this.placesRepo.findOne({ where: { id: placeId } });
    if (!place?.googleAccessToken || !place?.googleLocationName) {
      return { reviews: [], total: 0 };
    }

    let accessToken = place.googleAccessToken;
    const locationName = place.googleLocationName;
    const reviews: any[] = [];
    let pageToken: string | undefined;
    let retried = false;

    do {
      const url = `https://mybusiness.googleapis.com/v4/${locationName}/reviews?pageSize=50${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });

      if (res.status === 401 && !retried && place.googleRefreshToken) {
        accessToken = await this.doRefreshToken(placeId, place.googleRefreshToken);
        retried = true;
        continue;
      }

      const data = await res.json();
      if (data.error) {
        this.logger.error(`Reviews API error: ${JSON.stringify(data.error)}`);
        break;
      }

      if (data.reviews) reviews.push(...data.reviews);
      pageToken = data.nextPageToken;
    } while (pageToken);

    return { reviews, total: reviews.length };
  }

  private async getValidToken(placeId: string): Promise<string> {
    const place = await this.placesRepo.findOne({ where: { id: placeId } });
    if (!place?.googleAccessToken) {
      throw new Error('Sin token de Google. Conecta tu cuenta primero.');
    }
    return place.googleAccessToken;
  }

  private async doRefreshToken(placeId: string, refreshToken: string): Promise<string> {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    });
    const tokens = await res.json();
    if (!tokens.access_token) throw new Error('No se pudo renovar el token de Google');
    await this.placesRepo.update(placeId, { googleAccessToken: tokens.access_token });
    return tokens.access_token;
  }
}

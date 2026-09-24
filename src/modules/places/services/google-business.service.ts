import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHmac, timingSafeEqual } from 'crypto';
import { Place } from '../entities/place.entity';

const STATE_TTL_MS = 15 * 60_000;

/** Error de Google que el panel puede mostrar tal cual (código + mensaje). */
export class GoogleApiError extends BadRequestException {
  constructor(code: string, message: string) {
    super({ code, message });
  }
}

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
  get frontendUrl() {
    return this.config.get<string>('FRONTEND_URL') || 'https://warike.up.railway.app';
  }

  // ── OAuth state firmado ──────────────────────────────────────────────────
  // Antes el state era base64(placeId|userId) sin firma: cualquiera podía
  // fabricarlo y enlazar su cuenta de Google al local de otro dueño.

  private sign(payload: string): string {
    return createHmac('sha256', this.config.get<string>('JWT_SECRET')!).update(payload).digest('base64url');
  }

  private makeState(placeId: string, userId: string): string {
    const payload = Buffer.from(`${placeId}|${userId}|${Date.now() + STATE_TTL_MS}`).toString('base64url');
    return `${payload}.${this.sign(payload)}`;
  }

  /** Devuelve {placeId, userId} si el state es auténtico y no expiró; si no, null. */
  verifyState(state: string | undefined): { placeId: string; userId: string } | null {
    const [payload, sig] = (state || '').split('.');
    if (!payload || !sig) return null;
    const expected = Buffer.from(this.sign(payload));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    const [placeId, userId, exp] = Buffer.from(payload, 'base64url').toString().split('|');
    if (!placeId || !userId || !(Number(exp) > Date.now())) return null;
    return { placeId, userId };
  }

  getAuthUrl(placeId: string, userId: string): string {
    if (!this.clientId) throw new Error('GOOGLE_CLIENT_ID no configurado en el servidor');
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/business.manage',
      access_type: 'offline',
      prompt: 'consent',
      state: this.makeState(placeId, userId),
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  private errorRedirect(code: string) {
    return `${this.frontendUrl}/reputacion?error=${encodeURIComponent(code)}`;
  }

  async handleCallback(code: string, state: string): Promise<string> {
    const verified = this.verifyState(state);
    if (!verified) return this.errorRedirect('invalid_state');

    // El usuario que inició el flujo debe seguir siendo el dueño del local.
    const place = await this.placesRepo.findOne({ where: { id: verified.placeId } });
    if (!place || place.claimedByUserId !== verified.userId) return this.errorRedirect('forbidden');

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
      return this.errorRedirect('token_failed');
    }

    await this.placesRepo.update(verified.placeId, {
      googleAccessToken: tokens.access_token,
      // Google solo reenvía refresh_token con prompt=consent; no borrar el anterior si falta.
      ...(tokens.refresh_token ? { googleRefreshToken: tokens.refresh_token } : {}),
    });

    return `${this.frontendUrl}/reputacion?connected=true`;
  }

  // ── Llamadas autenticadas ────────────────────────────────────────────────

  /** fetch con el token del local; renueva una vez si Google responde 401. */
  private async googleFetch(placeId: string, url: string, init: RequestInit = {}): Promise<any> {
    const place = await this.placesRepo.findOne({ where: { id: placeId } });
    if (!place?.googleAccessToken) {
      throw new GoogleApiError('not_connected', 'Conecta tu cuenta de Google Business primero.');
    }
    const call = (token: string) =>
      fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });

    let res = await call(place.googleAccessToken);
    if (res.status === 401) {
      if (!place.googleRefreshToken) {
        throw new GoogleApiError('token_expired', 'Tu sesión de Google expiró. Vuelve a conectar tu cuenta.');
      }
      res = await call(await this.doRefreshToken(placeId, place.googleRefreshToken));
    }

    const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      this.logger.error(`Google API ${res.status} ${url}: ${JSON.stringify(data.error ?? data)}`);
      const status = data.error?.status;
      if (res.status === 401) throw new GoogleApiError('token_expired', 'Tu sesión de Google expiró. Vuelve a conectar tu cuenta.');
      if (status === 'PERMISSION_DENIED') throw new GoogleApiError('permission_denied', 'Tu cuenta de Google no administra este negocio o no está verificado.');
      if (res.status === 429) throw new GoogleApiError('quota', 'Google limitó las consultas. Intenta en unos minutos.');
      throw new GoogleApiError('google_error', data.error?.message || 'Google no respondió correctamente.');
    }
    return data;
  }

  async getLocations(placeId: string): Promise<any[]> {
    const accountsData = await this.googleFetch(placeId, 'https://mybusinessaccountmanagement.googleapis.com/v1/accounts');

    const locations: any[] = [];
    for (const account of (accountsData.accounts || [])) {
      const locData = await this.googleFetch(
        placeId,
        `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title,storefrontAddress`,
      );
      for (const loc of (locData.locations || [])) {
        locations.push({
          // La API v4 de reseñas exige "accounts/{a}/locations/{l}", no solo "locations/{l}".
          locationName: `${account.name}/${loc.name}`,
          title: loc.title,
          address: loc.storefrontAddress?.addressLines?.join(', ') || '',
        });
      }
    }
    return locations;
  }

  /** Ubicaciones guardadas antes del fix como "locations/{l}": se completa con la cuenta. */
  private async resolveLocationName(placeId: string, stored: string): Promise<string> {
    if (stored.startsWith('accounts/')) return stored;
    const match = (await this.getLocations(placeId)).find((l) => l.locationName.endsWith(`/${stored}`));
    if (!match) throw new GoogleApiError('location_missing', 'No encontramos tu negocio en tu cuenta de Google. Selecciónalo de nuevo.');
    await this.placesRepo.update(placeId, { googleLocationName: match.locationName });
    return match.locationName;
  }

  async getAllReviews(placeId: string): Promise<{ reviews: any[]; total: number; averageRating: number | null }> {
    const place = await this.placesRepo.findOne({ where: { id: placeId } });
    if (!place?.googleAccessToken || !place?.googleLocationName) {
      throw new GoogleApiError('not_connected', 'Conecta tu cuenta de Google Business primero.');
    }
    const locationName = await this.resolveLocationName(placeId, place.googleLocationName);

    const reviews: any[] = [];
    let total = 0;
    let averageRating: number | null = null;
    let pageToken: string | undefined;
    do {
      const data = await this.googleFetch(
        placeId,
        `https://mybusiness.googleapis.com/v4/${locationName}/reviews?pageSize=50${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`,
      );
      if (data.reviews) reviews.push(...data.reviews);
      total = data.totalReviewCount ?? total;
      averageRating = data.averageRating ?? averageRating;
      pageToken = data.nextPageToken;
    } while (pageToken);

    return { reviews, total: total || reviews.length, averageRating };
  }

  /** Publica o reemplaza la respuesta del dueño a una reseña. */
  async replyToReview(placeId: string, reviewName: string, comment: string): Promise<void> {
    const place = await this.placesRepo.findOne({ where: { id: placeId } });
    const locationName = place?.googleLocationName
      ? await this.resolveLocationName(placeId, place.googleLocationName)
      : null;
    // La reseña debe pertenecer a la ubicación del local — evita responder en negocios ajenos.
    if (!locationName || !reviewName?.startsWith(`${locationName}/reviews/`)) {
      throw new BadRequestException('La reseña no pertenece a este local');
    }
    await this.googleFetch(placeId, `https://mybusiness.googleapis.com/v4/${reviewName}/reply`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment }),
    });
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
    if (!tokens.access_token) {
      throw new GoogleApiError('token_expired', 'Tu sesión de Google expiró. Vuelve a conectar tu cuenta.');
    }
    await this.placesRepo.update(placeId, { googleAccessToken: tokens.access_token });
    return tokens.access_token;
  }
}

import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Place } from '../places/entities/place.entity';
import { PublicFeedback } from '../checkins/entities/public-feedback.entity';
import axios from 'axios';
import * as crypto from 'crypto';

@Injectable()
export class MetaAdsService {
  private readonly logger = new Logger(MetaAdsService.name);

  constructor(
    @InjectRepository(Place)
    private readonly placeRepo: Repository<Place>,
    @InjectRepository(PublicFeedback)
    private readonly feedbackRepo: Repository<PublicFeedback>,
  ) {}

  /**
   * Encripta un string en formato hash unidireccional SHA-256 (estándar requerido por Meta).
   */
  private hashSHA256(text: string): string {
    return crypto.createHash('sha256').update(text.trim().toLowerCase()).digest('hex');
  }

  /**
   * Normaliza un correo electrónico (minúsculas, sin espacios laterales).
   */
  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  /**
   * Normaliza un número de teléfono para el formato E.164 requerido por Meta.
   * Si es número peruano de 9 dígitos que empieza con 9, le antepone el código de país "51".
   */
  private normalizePhone(phone: string): string {
    let clean = phone.replace(/\D/g, ''); // Deja solo dígitos
    if (clean.length === 9 && clean.startsWith('9')) {
      clean = '51' + clean;
    }
    return clean;
  }

  /**
   * Obtiene la conexión y estado de Meta de un restaurante.
   */
  async getConnectionStatus(placeId: string) {
    const place = await this.placeRepo.findOneBy({ id: placeId });
    if (!place) {
      throw new NotFoundException('Restaurante no encontrado');
    }

    const metadata = place.metadata || {};
    return {
      connected: !!metadata.metaAccessToken,
      adAccountId: metadata.metaAdAccountId || null,
      customAudienceId: metadata.metaCustomAudienceId || null,
      lastSyncAt: metadata.metaLastSyncAt || null,
      syncCount: metadata.metaSyncCount || 0,
    };
  }

  /**
   * Guarda las credenciales de conexión de Meta del restaurante en su metadata.
   */
  async saveConnection(placeId: string, data: { accessToken: string; adAccountId: string }) {
    const place = await this.placeRepo.findOneBy({ id: placeId });
    if (!place) {
      throw new NotFoundException('Restaurante no encontrado');
    }

    if (!place.metadata) {
      place.metadata = {};
    }

    // Asegurarse de que el ID de la cuenta tenga el prefijo 'act_' requerido por la API de Facebook
    let adAccountId = data.adAccountId.trim();
    if (!adAccountId.startsWith('act_')) {
      adAccountId = 'act_' + adAccountId;
    }

    place.metadata.metaAccessToken = data.accessToken;
    place.metadata.metaAdAccountId = adAccountId;

    await this.placeRepo.save(place);
    return { success: true, message: 'Conexión con Meta configurada correctamente.' };
  }

  /**
   * Desconecta e invalida la integración de Meta para un restaurante.
   */
  async disconnectConnection(placeId: string) {
    const place = await this.placeRepo.findOneBy({ id: placeId });
    if (!place) {
      throw new NotFoundException('Restaurante no encontrado');
    }

    if (place.metadata) {
      delete place.metadata.metaAccessToken;
      delete place.metadata.metaAdAccountId;
      delete place.metadata.metaCustomAudienceId;
      delete place.metadata.metaLastSyncAt;
      delete place.metadata.metaSyncCount;
    }

    await this.placeRepo.save(place);
    return { success: true, message: 'Integración de Meta desconectada correctamente.' };
  }

  /**
   * Obtiene la lista de cuentas publicitarias asociadas al token de Meta del usuario.
   */
  async getAdAccounts(accessToken: string) {
    try {
      const response = await axios.get('https://graph.facebook.com/v20.0/me/adaccounts', {
        params: {
          fields: 'name,account_id,id',
          access_token: accessToken,
        },
      });
      return response.data.data || [];
    } catch (error) {
      this.logger.error('Error fetching Facebook Ad Accounts:', error.response?.data || error.message);
      throw new BadRequestException('No se pudieron recuperar las cuentas publicitarias de Facebook. Verifica el Access Token.');
    }
  }

  /**
   * Sincroniza de forma encriptada la base de datos de comensales con Meta Ads Custom Audience.
   */
  async syncAudience(placeId: string) {
    const place = await this.placeRepo.findOneBy({ id: placeId });
    if (!place) {
      throw new NotFoundException('Restaurante no encontrado');
    }

    const metadata = place.metadata || {};
    const accessToken = metadata.metaAccessToken;
    const adAccountId = metadata.metaAdAccountId;

    if (!accessToken || !adAccountId) {
      throw new BadRequestException('Debes conectar Wuarike con Facebook Ads antes de realizar una sincronización.');
    }

    // 1. Obtener comensales de este restaurante que dieron consentimiento de marketing
    const feedbacks = await this.feedbackRepo.find({
      where: { placeId, marketingConsent: true },
    });

    if (feedbacks.length === 0) {
      return {
        success: true,
        synchronizedCount: 0,
        message: 'No hay clientes registrados con consentimiento de marketing todavía.',
      };
    }

    // 2. Normalizar e encriptar correos/teléfonos (SHA-256)
    const payloadData: string[][] = [];

    for (const fb of feedbacks) {
      if (!fb.customerContact) continue;

      const contact = fb.customerContact.trim();
      let emailHash = '';
      let phoneHash = '';

      if (contact.includes('@')) {
        emailHash = this.hashSHA256(this.normalizeEmail(contact));
      } else {
        phoneHash = this.hashSHA256(this.normalizePhone(contact));
      }

      // Añadimos la fila [email_hash, phone_hash] requerida por el esquema de Meta
      // Si alguno no está presente, enviamos una cadena vacía
      payloadData.push([emailHash, phoneHash]);
    }

    if (payloadData.length === 0) {
      return {
        success: true,
        synchronizedCount: 0,
        message: 'No hay contactos válidos que coincidan para sincronizar.',
      };
    }

    try {
      let customAudienceId = metadata.metaCustomAudienceId;

      // 3. Crear la Audiencia Personalizada en Meta si no existe aún
      if (!customAudienceId) {
        this.logger.log(`Creando nueva Audiencia Personalizada en Facebook para Place ${placeId}`);
        const audienceResponse = await axios.post(
          `https://graph.facebook.com/v20.0/${adAccountId}/customaudiences`,
          {
            name: `Wuarike NFC - ${place.name || 'Restaurante'}`,
            subtype: 'CUSTOM',
            description: 'Clientes físicos que escanearon Tags NFC y autorizaron el uso de sus datos en Wuarike.',
            customer_file_source: 'USER_PROVIDED_ONLY',
          },
          {
            params: { access_token: accessToken },
          },
        );

        customAudienceId = audienceResponse.data.id;
        place.metadata.metaCustomAudienceId = customAudienceId;
        await this.placeRepo.save(place);
      }

      // 4. Subir la lista de clientes cifrados (SHA-256 Hashed) a Meta Custom Audiences
      this.logger.log(`Subiendo ${payloadData.length} contactos encriptados a la Custom Audience ${customAudienceId}`);
      await axios.post(
        `https://graph.facebook.com/v20.0/${customAudienceId}/users`,
        {
          payload: {
            schema: ['EMAIL', 'PHONE'],
            data: payloadData,
          },
        },
        {
          params: { access_token: accessToken },
        },
      );

      // 5. Guardar metadatos del estado del último envío exitoso
      place.metadata.metaLastSyncAt = new Date();
      place.metadata.metaSyncCount = payloadData.length;
      await this.placeRepo.save(place);

      return {
        success: true,
        synchronizedCount: payloadData.length,
        customAudienceId,
        message: `¡Sincronización con Meta Ads finalizada exitosamente! Se sincronizaron ${payloadData.length} clientes de forma segura.`,
      };
    } catch (error) {
      const errorData = error.response?.data || error.message;
      this.logger.error(`Error sincronizando audiencia con Meta en Place ${placeId}:`, errorData);
      throw new BadRequestException('Error en la comunicación con Meta API: ' + JSON.stringify(errorData));
    }
  }

  /**
   * Sincronización automática de TODOS los restaurantes que tienen activa la integración.
   * Diseñado para ejecutarse periódicamente en segundo plano (ej: en un Cron Job nocturno).
   */
  @Cron('0 2 * * *')
  async syncAllConnectedAudiences() {
    this.logger.log('Iniciando sincronización nocturna global de Meta Ads para todos los restaurantes conectados...');
    const places = await this.placeRepo.find();
    let processedCount = 0;

    for (const place of places) {
      const metadata = place.metadata || {};
      if (metadata.metaAccessToken && metadata.metaAdAccountId) {
        try {
          this.logger.log(`Cron: Sincronizando audiencia para local: ${place.name} (${place.id})`);
          await this.syncAudience(place.id);
          processedCount++;
        } catch (err) {
          this.logger.error(`Cron: Error sincronizando local ${place.name} (${place.id}):`, err.message);
        }
      }
    }

    this.logger.log(`Cron: Finalizada la sincronización global. Locales procesados exitosamente: ${processedCount}`);
    return { processedPlaces: processedCount };
  }
}

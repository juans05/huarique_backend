import { BadGatewayException, BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomInt } from 'crypto';
import axios from 'axios';
import { WhatsAppNumber } from './entities/whatsapp-number.entity';
import { Place } from '../places/entities/place.entity';

export interface CompleteSignupDto {
    placeId: string;
    /** Código que entrega FB.login al terminar Embedded Signup. */
    code: string;
    /** IDs que Meta manda al navegador en el evento WA_EMBEDDED_SIGNUP (mensaje FINISH). */
    wabaId: string;
    phoneNumberId: string;
}

/**
 * Conexión directa con Meta (Embedded Signup): el dueño inicia sesión con Facebook, elige o crea su
 * cuenta de WhatsApp Business y su número, y Meta nos devuelve un código. Con él obtenemos el token,
 * suscribimos nuestra app a su cuenta (para recibir sus mensajes) y guardamos el número. Sin PlazBot.
 */
@Injectable()
export class MetaConnectService {
    private readonly logger = new Logger(MetaConnectService.name);

    constructor(
        @InjectRepository(WhatsAppNumber) private readonly numbers: Repository<WhatsAppNumber>,
        @InjectRepository(Place) private readonly places: Repository<Place>,
    ) {}

    private get version() {
        return process.env.WHATSAPP_API_VERSION || 'v20.0';
    }

    private get graph() {
        return `https://graph.facebook.com/${this.version}`;
    }

    /** Datos públicos que el navegador necesita para abrir el flujo de Facebook. */
    config() {
        const appId = process.env.META_APP_ID || '';
        const configId = process.env.META_EMBEDDED_SIGNUP_CONFIG_ID || '';
        return {
            configured: !!(appId && configId && process.env.META_APP_SECRET),
            appId,
            configId,
            graphVersion: this.version,
        };
    }

    private async call<T = any>(method: 'get' | 'post', url: string, token?: string, data?: unknown, params?: Record<string, string>): Promise<T> {
        try {
            const res = await axios.request({
                method,
                url: url.startsWith('http') ? url : `${this.graph}${url}`,
                data,
                params,
                headers: token ? { Authorization: `Bearer ${token}` } : undefined,
                timeout: 20000,
            });
            return res.data as T;
        } catch (err: any) {
            throw new BadGatewayException(`Meta respondió con error: ${err?.response?.data?.error?.message || err?.message}`);
        }
    }

    private async ownedPlace(userId: string, placeId: string): Promise<Place> {
        const place = await this.places.findOne({ where: { id: placeId } });
        if (!place) throw new NotFoundException('Local no encontrado');
        if (place.claimedByUserId !== userId) throw new ForbiddenException('No tienes permiso para gestionar este local');
        return place;
    }

    /** ¿Este local activó la conexión directa con Facebook? (checkbox en el panel; por defecto, no: sigue PlazBot) */
    async getChannel(userId: string, placeId: string) {
        const place = await this.ownedPlace(userId, placeId);
        return { metaEnabled: place.metadata?.whatsappMetaEnabled === true };
    }

    /**
     * Activa o desactiva el canal de Facebook para el local. Los dos canales conviven sin mezclarse: al
     * desactivar, los números conectados por Facebook quedan inactivos y todo vuelve a PlazBot sin borrar nada;
     * al reactivar, vuelven a funcionar.
     */
    async setChannel(userId: string, placeId: string, metaEnabled: boolean) {
        const place = await this.ownedPlace(userId, placeId);
        place.metadata = { ...(place.metadata ?? {}), whatsappMetaEnabled: metaEnabled };
        await this.places.save(place);
        await this.numbers.update({ placeId, provider: 'meta' }, { isActive: metaEnabled });
        return { metaEnabled };
    }

    /**
     * Para el superadmin: conecta un número que ya está registrado en la API de WhatsApp de Meta (por ejemplo el
     * que antes atendía PlazBot). No hay que verificarlo ni migrarlo: se valida el token contra Meta, se suscribe
     * nuestra app a la cuenta para recibir sus mensajes y se guarda como conexión directa.
     */
    async connectExisting(dto: { placeId: string; phoneNumberId: string; wabaId: string; token: string }) {
        const place = await this.places.findOne({ where: { id: dto.placeId } });
        if (!place) throw new NotFoundException('Local no encontrado');

        const existing = await this.numbers.findOne({ where: { phoneNumberId: dto.phoneNumberId } });
        if (existing && existing.placeId !== dto.placeId) {
            throw new ConflictException('Este número de WhatsApp ya está conectado a otro local.');
        }

        // Si el token o el ID están mal, Meta responde con error y no se guarda nada.
        const info = await this.call<{ display_phone_number?: string; verified_name?: string }>('get', `/${dto.phoneNumberId}`, dto.token, undefined, {
            fields: 'display_phone_number,verified_name',
        });
        await this.call('post', `/${dto.wabaId}/subscribed_apps`, dto.token);

        const saved = await this.numbers.save(
            this.numbers.create({
                ...(existing ?? {}),
                placeId: dto.placeId,
                phoneNumber: (info.display_phone_number || '').replace(/\D/g, ''),
                phoneNumberId: dto.phoneNumberId,
                wabaId: dto.wabaId,
                whatsappApiToken: dto.token,
                provider: 'meta',
                isActive: true,
                verificationStatus: 'VERIFIED',
            }),
        );

        // El local queda con el canal de Facebook activado, para que el panel del dueño lo refleje.
        place.metadata = { ...(place.metadata ?? {}), whatsappMetaEnabled: true };
        await this.places.save(place);

        return { id: saved.id, phoneNumber: saved.phoneNumber, verifiedName: info.verified_name ?? null };
    }

    async complete(userId: string, dto: CompleteSignupDto) {
        const appId = process.env.META_APP_ID;
        const appSecret = process.env.META_APP_SECRET;
        if (!appId || !appSecret) throw new ServiceUnavailableException('La conexión con Facebook no está configurada en el servidor.');

        const place = await this.ownedPlace(userId, dto.placeId);
        if (place.metadata?.whatsappMetaEnabled !== true) {
            throw new BadRequestException('Activa primero la conexión con Facebook para este local.');
        }

        // Un número solo puede pertenecer a un local: evita que alguien se "robe" uno ya conectado.
        const existing = await this.numbers.findOne({ where: { phoneNumberId: dto.phoneNumberId } });
        if (existing && existing.placeId !== dto.placeId) {
            throw new ConflictException('Este número de WhatsApp ya está conectado a otro local.');
        }

        // 1) Código → token de acceso del negocio
        const { access_token: token } = await this.call<{ access_token: string }>('get', '/oauth/access_token', undefined, undefined, {
            client_id: appId,
            client_secret: appSecret,
            code: dto.code,
        });
        if (!token) throw new BadGatewayException('Meta no devolvió un token de acceso.');

        // 2) Suscribir nuestra app a la cuenta de WhatsApp Business: así llegan sus mensajes a nuestro webhook.
        await this.call('post', `/${dto.wabaId}/subscribed_apps`, token);

        // 3) Registrar el número en la Cloud API. Si Embedded Signup ya lo dejó registrado, Meta responde
        //    con error y no es un problema, por eso solo se registra el aviso.
        try {
            await this.call('post', `/${dto.phoneNumberId}/register`, token, { messaging_product: 'whatsapp', pin: String(randomInt(100000, 1000000)) });
        } catch (err: any) {
            this.logger.warn(`[meta-connect] register omitido: ${err?.message}`);
        }

        // 4) Datos del número para mostrarlo en el panel
        const info = await this.call<{ display_phone_number?: string; verified_name?: string }>('get', `/${dto.phoneNumberId}`, token, undefined, {
            fields: 'display_phone_number,verified_name',
        });
        const phoneNumber = (info.display_phone_number || '').replace(/\D/g, '');

        const saved = await this.numbers.save(
            this.numbers.create({
                ...(existing ?? {}),
                placeId: dto.placeId,
                phoneNumber,
                phoneNumberId: dto.phoneNumberId,
                wabaId: dto.wabaId,
                whatsappApiToken: token,
                provider: 'meta',
                isActive: true,
                verificationStatus: 'VERIFIED',
            }),
        );

        return { id: saved.id, phoneNumber: saved.phoneNumber, verifiedName: info.verified_name ?? null };
    }
}

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PushDevice } from './push-device.entity';

export type PushKind = 'nueva' | 'te_toca' | 'traspaso';
export type PushMessage = { title: string; body: string; data: { appointmentId: string; placeId: string; kind: PushKind } };

const EXPO_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH = 100;

/** Push a la app del barbero vía Expo Push API (HTTP, sin dependencia). Nunca lanza: el aviso no debe romper la cita. */
@Injectable()
export class PushService {
    private readonly logger = new Logger(PushService.name);

    constructor(@InjectRepository(PushDevice) private devices: Repository<PushDevice>) { }

    register(userId: string, token: string, platform = 'android') {
        // Un mismo celular que cambia de cuenta: el token pasa al usuario actual.
        return this.devices.upsert({ userId, token, platform }, ['token']);
    }

    unregister(token: string) {
        return this.devices.delete({ token });
    }

    async sendToUsers(userIds: string[], msg: PushMessage): Promise<void> {
        try {
            const ids = [...new Set(userIds)];
            if (!ids.length) return;
            const tokens = (await this.devices.find({ where: { userId: In(ids) }, select: ['token'] })).map((d) => d.token);
            for (let i = 0; i < tokens.length; i += BATCH) {
                const batch = tokens.slice(i, i + BATCH);
                const res = await fetch(EXPO_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                    body: JSON.stringify(batch.map((to) => ({ to, ...msg, channelId: 'citas', sound: 'default', priority: 'high' }))),
                });
                const tickets: any[] = (await res.json())?.data ?? [];
                const dead = batch.filter((_, j) => tickets[j]?.details?.error === 'DeviceNotRegistered');
                if (dead.length) await this.devices.delete({ token: In(dead) });
            }
        } catch (err) {
            this.logger.warn(`Push no enviada: ${(err as Error).message}`);
        }
    }
}

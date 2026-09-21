import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { Checkin } from '../entities/checkin.entity';

interface AntiFraudValidation {
    isValid: boolean;
    error?: string;
    remainingTime?: number;
}

/**
 * Tope de error del GPS aceptable. Se fija igual al radio de proximidad: si el
 * margen de error del dispositivo supera el radio contra el que validamos, la
 * validación de proximidad deja de significar nada.
 */
const MAX_ACCURACY_METERS = 200;

/**
 * Umbral de "viaje imposible": más rápido que un avión comercial. Debe dejar
 * pasar TODO medio de transporte real (monopatín, bici, auto, bus
 * interprovincial, vuelo a Cusco) y atrapar sólo el teletransporte de quien
 * falsea coordenadas, que da miles de km/h.
 *
 * El valor anterior era 50 km/h, que marcaba un viaje en bus a Asia como
 * fraude. Mientras sólo escribía un log daba igual; desde que el marcado
 * cuesta puntos y saca el check-in del feed, un falso positivo hace daño real.
 */
const IMPOSSIBLE_SPEED_KMH = 900;

/**
 * Debajo de esta distancia no se evalúa velocidad. El cooldown es por local,
 * así que dos check-ins en sitios distintos pueden estar a segundos uno del
 * otro: dividir por un lapso diminuto convierte el ruido normal del GPS en
 * velocidades absurdas. Además, dos locales a menos de 1 km jamás prueban
 * teletransporte.
 */
const MIN_DISTANCE_FOR_SPEED_KM = 1;

@Injectable()
export class AntiFraudService {
    constructor(
        @InjectRepository(Checkin)
        private checkinsRepository: Repository<Checkin>,
    ) { }

    /**
     * Validate check-in cooldown (4 hours per place)
     */
    async validateCooldown(userId: string, placeId: string): Promise<AntiFraudValidation> {
        const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);

        const recentCheckin = await this.checkinsRepository.findOne({
            where: {
                userId,
                placeId,
            },
            order: {
                createdAt: 'DESC',
            },
        });

        if (recentCheckin && recentCheckin.createdAt > fourHoursAgo) {
            const timeSinceCheckin = Date.now() - recentCheckin.createdAt.getTime();
            const remainingTime = (4 * 60 * 60 * 1000) - timeSinceCheckin;

            return {
                isValid: false,
                error: 'COOLDOWN_ACTIVE',
                remainingTime: Math.ceil(remainingTime / 1000), // seconds
            };
        }

        return { isValid: true };
    }

    /**
     * Validate daily check-in limit (10 per day)
     */
    async validateDailyLimit(userId: string): Promise<AntiFraudValidation> {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const todayCheckins = await this.checkinsRepository.count({
            where: {
                userId,
                createdAt: MoreThanOrEqual(startOfDay),
            },
        });

        if (todayCheckins >= 10) {
            return {
                isValid: false,
                error: 'DAILY_LIMIT_REACHED',
            };
        }

        return { isValid: true };
    }

    /**
     * Validate that the device is actually near the place being checked into.
     * 200m de margen para el drift normal de GPS (dentro de un local, entre
     * edificios) sin dejar pasar check-ins a varias cuadras de distancia.
     */
    validateProximity(
        userLat: number,
        userLng: number,
        placeLat: number,
        placeLng: number,
    ): { isValid: boolean; distanceMeters: number } {
        const MAX_DISTANCE_METERS = 200;
        const distanceMeters = this.calculateDistance(placeLat, placeLng, userLat, userLng) * 1000;
        return {
            isValid: distanceMeters <= MAX_DISTANCE_METERS,
            distanceMeters: Math.round(distanceMeters),
        };
    }

    /**
     * Detecta viajes imposibles entre check-ins: sólo velocidades que ningún
     * medio de transporte real alcanza (ver IMPOSSIBLE_SPEED_KMH).
     */
    async validateSpeed(
        userId: string,
        newLat: number,
        newLng: number,
    ): Promise<{ suspicious: boolean; speed?: number }> {
        const lastCheckin = await this.checkinsRepository
            .createQueryBuilder('checkin')
            .leftJoinAndSelect('checkin.place', 'place')
            .where('checkin.userId = :userId', { userId })
            .orderBy('checkin.createdAt', 'DESC')
            .limit(1)
            .getOne();

        if (!lastCheckin || !lastCheckin.place) {
            return { suspicious: false };
        }

        const distance = this.calculateDistance(
            Number(lastCheckin.place.latitude),
            Number(lastCheckin.place.longitude),
            newLat,
            newLng,
        );

        if (distance < MIN_DISTANCE_FOR_SPEED_KM) {
            return { suspicious: false };
        }

        const timeDiff = (Date.now() - lastCheckin.createdAt.getTime()) / (1000 * 60 * 60); // hours
        if (timeDiff <= 0) {
            return { suspicious: false };
        }

        const speed = distance / timeDiff; // km/h

        if (speed > IMPOSSIBLE_SPEED_KMH) {
            return {
                suspicious: true,
                speed: Math.round(speed),
            };
        }

        return { suspicious: false };
    }

    /**
     * Señales del propio dispositivo. La ubicación simulada es el vector de
     * fraude a escala (basta una app de mock location), y una precisión peor
     * que el radio de proximidad vuelve esa validación inútil: un punto con
     * ±2 km de error "cae dentro" de 200 m por pura casualidad.
     *
     * La ausencia de las señales también cuenta: un cliente manipulado que
     * simplemente no las envíe no puede salir mejor parado que uno honesto.
     */
    validateDevice(
        isMocked: boolean | undefined,
        accuracyMeters: number | undefined,
    ): { suspicious: boolean; reason?: string } {
        if (isMocked === true) {
            return { suspicious: true, reason: 'MOCKED_LOCATION' };
        }
        if (accuracyMeters == null) {
            return { suspicious: true, reason: 'NO_ACCURACY_REPORTED' };
        }
        if (accuracyMeters > MAX_ACCURACY_METERS) {
            return {
                suspicious: true,
                reason: `LOW_GPS_ACCURACY_${Math.round(accuracyMeters)}M`,
            };
        }
        return { suspicious: false };
    }

    /**
     * Calculate distance between two points (Haversine formula)
     */
    private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
        const R = 6371; // Earth's radius in km
        const dLat = this.toRad(lat2 - lat1);
        const dLng = this.toRad(lng2 - lng1);

        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRad(lat1)) *
            Math.cos(this.toRad(lat2)) *
            Math.sin(dLng / 2) *
            Math.sin(dLng / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    private toRad(degrees: number): number {
        return degrees * (Math.PI / 180);
    }
}

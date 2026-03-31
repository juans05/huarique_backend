import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Place } from '../entities/place.entity';

@Injectable()
export class GeolocationService {
    constructor(
        @InjectRepository(Place)
        private placesRepository: Repository<Place>,
    ) { }

    /**
     * Find nearby wuarikes using PostGIS
     * @param latitude User's latitude
     * @param longitude User's longitude
     * @param radiusKm Search radius in kilometers
     * @param limit Maximum number of results
     * @returns Array of places with distance
     */
    async findNearby(
        latitude: number,
        longitude: number,
        radiusKm: number = 5,
        limit: number = 50,
    ): Promise<any[]> {
        const query = `
            SELECT 
                p.*,
                ST_Distance(
                    p.location::geography,
                    ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
                ) / 1000 AS distance
            FROM places p
            WHERE 
                p.status = 'active'
                AND ST_DWithin(
                    p.location::geography,
                    ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
                    $3 * 1000
                )
            ORDER BY distance
            LIMIT $4
        `;

        const places = await this.placesRepository.query(query, [
            longitude, // PostGIS uses (lng, lat)
            latitude,
            radiusKm,
            limit,
        ]);

        return places;
    }

    /**
     * Calculate distance between two points using Haversine formula
     * @param lat1 First point latitude
     * @param lng1 First point longitude
     * @param lat2 Second point latitude
     * @param lng2 Second point longitude
     * @returns Distance in kilometers
     */
    calculateDistance(
        lat1: number,
        lng1: number,
        lat2: number,
        lng2: number,
    ): number {
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

    /**
     * Validate that user is within proximity of a place
     * @param placeId Place ID to check
     * @param userLat User's latitude
     * @param userLng User's longitude
     * @param maxDistanceMeters Maximum allowed distance in meters
     * @returns Object with isNear boolean and distance in meters
     */
    async validateProximity(
        placeId: string,
        userLat: number,
        userLng: number,
        maxDistanceMeters: number = 100,
    ): Promise<{ isNear: boolean; distance: number }> {
        const place = await this.placesRepository.findOne({
            where: { id: placeId },
        });

        if (!place) {
            throw new Error('Place not found');
        }

        const distance = this.calculateDistance(
            userLat,
            userLng,
            Number(place.latitude),
            Number(place.longitude),
        ) * 1000; // Convert to meters

        return {
            isNear: distance <= maxDistanceMeters,
            distance: Math.round(distance),
        };
    }

    /**
     * Update location geometry field when creating/updating a place
     * @param place Place entity
     */
    updateLocationGeometry(place: Place): void {
        if (place.latitude && place.longitude) {
            // PostGIS Point format: POINT(longitude latitude)
            place.location = `POINT(${place.longitude} ${place.latitude})`;
        }
    }

    /**
     * Convert degrees to radians
     */
    private toRad(degrees: number): number {
        return degrees * (Math.PI / 180);
    }
}

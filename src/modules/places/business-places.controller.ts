import {
    Controller,
    Get,
    Patch,
    Param,
    Body,
    UseGuards,
    Post,
    ForbiddenException,
    Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlacesService } from './places.service';
import { GoogleMapsService } from './services/google-maps.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Place } from './entities/place.entity';
import { Repository, Like, ILike } from 'typeorm';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('business-places')
@Controller('business')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BusinessPlacesController {
    constructor(
        private readonly placesService: PlacesService,
        private readonly googleMapsService: GoogleMapsService,
        @InjectRepository(Place)
        private placesRepo: Repository<Place>,
    ) {}

    @Get('onboarding/search')
    @ApiOperation({ summary: 'Search for places in Wuarike and Google for onboarding' })
    async searchOnboarding(@Query('q') query: string) {
        if (!query || query.length < 3) return { wuarike: [], google: [] };

        // 1. Search in Wuarike (already registered by users)
        const wuarikePlaces = await this.placesRepo.find({
            where: { name: ILike(`%${query}%`) },
            take: 10
        });

        // 2. Search in Google Maps
        const googleResults = await this.googleMapsService.searchPlaces(query);

        return {
            wuarike: wuarikePlaces.map(p => ({
                id: p.id,
                name: p.name,
                address: p.address,
                googlePlaceId: p.googlePlaceId,
                isClaimed: !!p.claimedByUserId,
                source: 'wuarike'
            })),
            google: googleResults
        };
    }

    @Post('onboarding/claim/:id')
    @ApiOperation({ summary: 'Claim an existing Wuarike place' })
    async claimPlace(@Param('id') id: string, @CurrentUser() user: any) {
        const place = await this.placesRepo.findOne({ where: { id } });
        if (!place) throw new Error('Place not found');
        if (place.claimedByUserId) throw new Error('Place already claimed');

        await this.placesRepo.update(id, {
            claimedByUserId: user.id,
            status: 'pending' // Needs verification
        });

        return { message: 'Reclamación iniciada con éxito', placeId: id };
    }

    @Post('onboarding/import')
    @ApiOperation({ summary: 'Import a place from Google and claim it' })
    async importPlace(@Body('googlePlaceId') googlePlaceId: string, @CurrentUser() user: any) {
        // Check if already in Wuarike
        const existing = await this.placesRepo.findOne({ where: { googlePlaceId } });
        if (existing) {
            return this.claimPlace(existing.id, user);
        }

        // Get details from Google
        const details = await this.googleMapsService.getPlaceDetails(googlePlaceId);
        if (!details) throw new Error('Could not fetch details from Google');

        // Create in Wuarike and assign to user
        const newPlace = this.placesRepo.create({
            ...details,
            claimedByUserId: user.id,
            status: 'pending'
        });

        const saved = await this.placesRepo.save(newPlace);
        return { message: 'Local importado y reclamado', placeId: saved.id };
    }

    @Post('onboarding/create')
    @ApiOperation({ summary: 'Create a new place manually' })
    async createPlace(@Body() data: { name: string, address?: string }, @CurrentUser() user: any) {
        // Final check for similar names to prevent duplicates
        const existing = await this.placesRepo.findOne({ 
            where: { name: ILike(data.name) } 
        });
        
        if (existing) {
            throw new Error('Ya existe un restaurante con un nombre similar en Wuarike.');
        }

        const newPlace = this.placesRepo.create({
            name: data.name,
            address: data.address || '',
            claimedByUserId: user.id,
            status: 'pending'
        });

        const saved = await this.placesRepo.save(newPlace);
        return { message: 'Local creado con éxito', placeId: saved.id };
    }

    @Get('my-places')
    @ApiOperation({ summary: 'List places owned by the authenticated business user' })
    async getMyPlaces(@CurrentUser() user: any) {
        return this.placesRepo.find({
            where: { claimedByUserId: user.id },
            relations: ['category', 'claimedBy'],
        });
    }

    @Get('places/:id/profile')
    @ApiOperation({ summary: 'Get business profile for owner' })
    @ApiParam({ name: 'id', description: 'Place UUID' })
    async getProfile(@Param('id') id: string, @CurrentUser() user: any) {
        const place = await this.placesService.findOne(id);
        if (place.claimedByUserId !== user.id) {
            throw new ForbiddenException('No tienes permiso para ver este local');
        }
        return place;
    }

    @Patch('places/:id/profile')
    @ApiOperation({ summary: 'Update business profile' })
    @ApiParam({ name: 'id', description: 'Place UUID' })
    async updateProfile(@Param('id') id: string, @Body() data: any, @CurrentUser() user: any) {
        const place = await this.placesRepo.findOne({ where: { id } });
        if (!place || place.claimedByUserId !== user.id) {
            throw new ForbiddenException('No tienes permiso para editar este local');
        }

        await this.placesRepo.update(id, {
            name: data.name,
            address: data.address,
            categoryId: data.categoryId,
            openHoursText: data.openHoursText,
            priceMin: data.priceMin,
            coverImageUrl: data.coverImageUrl,
            googlePlaceId: data.googlePlaceId,
        });
        return { message: 'Perfil actualizado' };
    }

    @Post('places/:id/google-sync')
    @ApiOperation({ summary: 'Sync reviews and rating from Google Maps' })
    @ApiParam({ name: 'id', description: 'Place UUID' })
    async syncGoogle(@Param('id') id: string, @CurrentUser() user: any) {
        const place = await this.placesRepo.findOne({ where: { id } });
        if (!place || place.claimedByUserId !== user.id) {
            throw new ForbiddenException('No tienes permiso para sincronizar este local');
        }

        if (!place.googlePlaceId) {
            throw new Error('No Google Place ID configured');
        }

        const googleData = await this.googleMapsService.getPlaceReviews(place.googlePlaceId);
        
        if (googleData) {
            await this.placesRepo.update(id, {
                googleRating: googleData.rating,
            });
        }

        return googleData;
    }
}

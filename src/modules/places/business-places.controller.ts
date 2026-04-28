import {
    Controller,
    Get,
    Patch,
    Param,
    Body,
    UseGuards,
    Post,
    ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlacesService } from './places.service';
import { GoogleMapsService } from './services/google-maps.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Place } from './entities/place.entity';
import { Repository } from 'typeorm';
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

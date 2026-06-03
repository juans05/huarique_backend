import {
    Controller,
    Get,
    Patch,
    Delete,
    Param,
    Body,
    UseGuards,
    Post,
    ForbiddenException,
    BadRequestException,
    NotFoundException,
    Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlacesService } from './places.service';
import { GoogleMapsService } from './services/google-maps.service';
import { GoogleBusinessService } from './services/google-business.service';
import { AiService } from '../ai/ai.service';
import { MenuService } from './menu.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Place } from './entities/place.entity';
import { Amenity } from './entities/amenity.entity';
import { Repository, ILike, IsNull, In } from 'typeorm';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateOnboardingPlaceDto } from './dto/create-onboarding-place.dto';

import { GoogleReview } from './entities/google-review.entity';

@ApiTags('business-places')
@Controller('business')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BusinessPlacesController {
    constructor(
        private readonly placesService: PlacesService,
        private readonly googleMapsService: GoogleMapsService,
        private readonly googleBusinessService: GoogleBusinessService,
        private readonly aiService: AiService,
        private readonly menuService: MenuService,
        @InjectRepository(Place)
        private placesRepo: Repository<Place>,
        @InjectRepository(Amenity)
        private amenityRepo: Repository<Amenity>,
        @InjectRepository(GoogleReview)
        private googleReviewsRepo: Repository<GoogleReview>,
    ) { }

    @Get('onboarding/search')
    @ApiOperation({ summary: 'Search for places in Wuarike and Google for onboarding' })
    async searchOnboarding(@Query('q') query: string) {
        if (!query || query.length < 3) return { wuarike: [], google: [] };

        // 1. Search in Wuarike (already registered by users)
        const wuarikePlaces = await this.placesRepo.find({
            where: { name: ILike(`%${query}%`) },
            order: { name: 'ASC' },
            take: 10
        });

        // Sort: exact match first, then starts with, then contains
        const queryLower = query.toLowerCase();
        wuarikePlaces.sort((a, b) => {
            const aName = (a.name || '').toLowerCase();
            const bName = (b.name || '').toLowerCase();
            const aExact = aName === queryLower ? 0 : aName.startsWith(queryLower) ? 1 : 2;
            const bExact = bName === queryLower ? 0 : bName.startsWith(queryLower) ? 1 : 2;
            return aExact - bExact;
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
        const result = await this.placesRepo.update(
            { id, claimedByUserId: IsNull() },
            { claimedByUserId: user.id, status: 'pending' }
        );

        if (result.affected === 0) {
            const place = await this.placesRepo.findOne({ where: { id } });
            if (!place) throw new NotFoundException('Lugar no encontrado');
            throw new BadRequestException('Este lugar ya ha sido reclamado');
        }

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
    async createPlace(@Body() dto: CreateOnboardingPlaceDto, @CurrentUser() user: any) {
        const name = dto.name.trim();

        const existing = await this.placesRepo.findOne({
            where: { name: ILike(name) }
        });

        if (existing) {
            throw new BadRequestException('Ya existe un local con un nombre similar en Wuarike.');
        }

        const newPlace = this.placesRepo.create({
            name,
            address: dto.address?.trim() || '',
            claimedByUserId: user.id,
            status: 'pending'
        });

        const saved = await this.placesRepo.save(newPlace);
        return { message: 'Local creado con éxito', placeId: saved.id };
    }

    @Get('my-places')
    @ApiOperation({ summary: 'List places owned by the authenticated business user' })
    async getMyPlaces(@CurrentUser() user: any) {
        const places = await this.placesRepo.find({
            where: { claimedByUserId: user.id },
            relations: ['category', 'claimedBy'],
        });
        return places.map(p => ({
            id: p.id,
            name: p.name,
            coverImageUrl: p.coverImageUrl,
            category: p.category,
        }));
    }

    @Get('places/:id/profile')
    @ApiOperation({ summary: 'Get business profile for owner' })
    @ApiParam({ name: 'id', description: 'Place UUID' })
    async getProfile(@Param('id') id: string, @CurrentUser() user: any) {
        console.log('----------------------------------------------------------');
        console.log('id', id);
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

        if (data.name !== undefined) place.name = data.name;
        if (data.address !== undefined) place.address = data.address;
        if (data.categoryId !== undefined) place.categoryId = data.categoryId;
        if (data.districtId !== undefined) place.districtId = data.districtId;
        if (data.openHoursText !== undefined) place.openHoursText = data.openHoursText;
        if (data.priceMin !== undefined) place.priceMin = data.priceMin;
        if (data.coverImageUrl !== undefined) place.coverImageUrl = data.coverImageUrl;
        if (data.googlePlaceId !== undefined) place.googlePlaceId = data.googlePlaceId;
        if (data.countryCode !== undefined) place.countryCode = data.countryCode;
        if (data.spainCommunity !== undefined) place.spainCommunity = data.spainCommunity;
        if (data.spainProvince !== undefined) place.spainProvince = data.spainProvince;
        if (data.spainMunicipality !== undefined) place.spainMunicipality = data.spainMunicipality;

        await this.placesRepo.save(place);

        if (data.amenityIds !== undefined && Array.isArray(data.amenityIds)) {
            const currentPlace = await this.placesRepo.findOne({
                where: { id },
                relations: ['amenities']
            });
            const currentAmenityIds = currentPlace?.amenities.map(a => a.id) || [];
            const toRemove = currentAmenityIds.filter(id => !data.amenityIds.includes(id));
            const toAdd = data.amenityIds.filter(id => !currentAmenityIds.includes(id));

            if (toRemove.length > 0) {
                await this.placesRepo
                    .createQueryBuilder()
                    .relation(Place, 'amenities')
                    .of(id)
                    .remove(toRemove);
            }

            if (toAdd.length > 0) {
                await this.placesRepo
                    .createQueryBuilder()
                    .relation(Place, 'amenities')
                    .of(id)
                    .add(toAdd);
            }
        }

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
            throw new BadRequestException('Este local no tiene un Google Place ID configurado. Agrégalo en el perfil del negocio.');
        }

        const googleData = await this.googleMapsService.getPlaceReviews(place.googlePlaceId);

        if (!googleData) {
            throw new BadRequestException('No se pudo conectar con Google Maps. Verifica que GOOGLE_MAPS_API_KEY esté configurada en el servidor.');
        }

        // 1. Update Rating and Total Count
        await this.placesRepo.update(id, {
            googleRating: googleData.rating,
            googleTotalReviews: googleData.totalReviews,
        });

        // 2. Persist new reviews
        if (googleData.reviews && googleData.reviews.length > 0) {
            try {
                const values = googleData.reviews.map(rev => ({
                    placeId: id,
                    authorName: rev.author_name,
                    authorPhotoUrl: rev.profile_photo_url,
                    rating: rev.rating,
                    text: rev.text,
                    relativeTimeDescription: rev.relative_time_description,
                    time: rev.time
                }));

                await this.googleReviewsRepo
                    .createQueryBuilder()
                    .insert()
                    .into(GoogleReview)
                    .values(values)
                    .orIgnore()
                    .execute();
            } catch (e) {
                console.error('Error batch saving google reviews', e);
            }
        }

        return {
            rating: googleData.rating,
            totalReviews: googleData.totalReviews,
            synced: googleData.reviews?.length || 0,
        };
    }

    @Get('places/:id/find-google-place-id')
    @ApiOperation({ summary: 'Auto-find Google Place ID by business name and address' })
    @ApiParam({ name: 'id', description: 'Place UUID' })
    async findGooglePlaceId(@Param('id') id: string, @CurrentUser() user: any) {
        const place = await this.placesRepo.findOne({
            where: { id },
            relations: ['district'],
        });
        if (!place || place.claimedByUserId !== user.id) {
            throw new ForbiddenException('No tienes permiso');
        }

        // Search with name + district/address for more precise results
        const query = place.address
            ? `${place.name} ${place.address}`
            : place.name;

        const results = await this.googleMapsService.searchPlaces(query);
        return { candidates: results.slice(0, 5) };
    }

    @Get('places/:id/google-debug')
    @ApiOperation({ summary: 'Debug: raw Google API response for a place' })
    @ApiParam({ name: 'id', description: 'Place UUID' })
    async debugGoogle(@Param('id') id: string, @CurrentUser() user: any) {
        const place = await this.placesRepo.findOne({ where: { id } });
        if (!place || place.claimedByUserId !== user.id) {
            throw new ForbiddenException('No tienes permiso');
        }
        return {
            googlePlaceId: place.googlePlaceId || null,
            hasApiKey: !!process.env.GOOGLE_MAPS_API_KEY,
            data: place.googlePlaceId
                ? await this.googleMapsService.getPlaceReviews(place.googlePlaceId).catch(e => ({ error: e.message }))
                : null,
        };
    }

    @Get('places/:id/google-reviews')
    @ApiOperation({ summary: 'Get persisted Google reviews from DB' })
    @ApiParam({ name: 'id', description: 'Place UUID' })
    async getPersistedReviews(@Param('id') id: string, @CurrentUser() user: any) {
        const place = await this.placesRepo.findOne({ where: { id } });
        if (!place || place.claimedByUserId !== user.id) {
            throw new ForbiddenException('No tienes permiso para ver estas reseñas');
        }

        return this.googleReviewsRepo.find({
            where: { placeId: id },
            order: { time: 'DESC' }
        });
    }

    // ── Google Business Profile OAuth ───────────────────────────────────────

    @Get('google/auth-url')
    @ApiOperation({ summary: 'Get Google OAuth URL to connect Business Profile' })
    async getGoogleAuthUrl(@Query('placeId') placeId: string, @CurrentUser() user: any) {
        const place = await this.placesRepo.findOne({ where: { id: placeId } });
        if (!place || place.claimedByUserId !== user.id) {
            throw new ForbiddenException('No tienes permiso');
        }
        const url = this.googleBusinessService.getAuthUrl(placeId, user.id);
        return { url };
    }

    @Get('places/:id/google-locations')
    @ApiOperation({ summary: 'List Google Business locations available after OAuth' })
    @ApiParam({ name: 'id', description: 'Place UUID' })
    async getGoogleLocations(@Param('id') id: string, @CurrentUser() user: any) {
        const place = await this.placesRepo.findOne({ where: { id } });
        if (!place || place.claimedByUserId !== user.id) {
            throw new ForbiddenException('No tienes permiso');
        }
        const locations = await this.googleBusinessService.getLocations(id);
        return { locations };
    }

    @Post('places/:id/google-location')
    @ApiOperation({ summary: 'Save selected Google Business location for this place' })
    @ApiParam({ name: 'id', description: 'Place UUID' })
    async setGoogleLocation(
        @Param('id') id: string,
        @Body('locationName') locationName: string,
        @CurrentUser() user: any,
    ) {
        const place = await this.placesRepo.findOne({ where: { id } });
        if (!place || place.claimedByUserId !== user.id) {
            throw new ForbiddenException('No tienes permiso');
        }
        await this.placesRepo.update(id, { googleLocationName: locationName });
        return { message: 'Ubicación de Google guardada' };
    }

    @Get('places/:id/all-google-reviews')
    @ApiOperation({ summary: 'Fetch ALL reviews from Google Business Profile API' })
    @ApiParam({ name: 'id', description: 'Place UUID' })
    async getAllGoogleReviews(@Param('id') id: string, @CurrentUser() user: any) {
        const place = await this.placesRepo.findOne({ where: { id } });
        if (!place || place.claimedByUserId !== user.id) {
            throw new ForbiddenException('No tienes permiso');
        }
        return this.googleBusinessService.getAllReviews(id);
    }

    @Post('places/:id/suggest-bot-prompt')
    @ApiOperation({ summary: 'Generate AI-suggested system prompt for the bot based on restaurant profile' })
    async suggestBotPrompt(@Param('id') id: string, @CurrentUser() user: any) {
        const place = await this.placesRepo.findOne({ where: { id }, relations: ['category'] });
        if (!place || place.claimedByUserId !== user.id) {
            throw new ForbiddenException('No tienes permiso');
        }

        const name = place.name || 'el restaurante';
        const description = place.description ? `\nDescripción: ${place.description}` : '';
        const category = place.category?.name ? `\nTipo: ${place.category.name}` : '';
        const address = place.address ? `\nUbicación: ${place.address}` : '';

        const prompt = await this.aiService.chat([
            {
                role: 'system',
                content: 'Eres un experto en configuración de chatbots para restaurantes peruanos. Responde SOLO con el texto del system prompt, sin explicaciones adicionales ni comillas.',
            },
            {
                role: 'user',
                content: `Crea un system prompt en español para un bot de WhatsApp de un restaurante con estos datos:
Nombre: ${name}${category}${description}${address}

El prompt debe:
- Presentar al bot como asistente de ${name}
- Ser amable y en tono profesional
- Mencionar que puede ayudar con el menú, reservas, horarios y consultas generales
- Invitar a preguntar sobre los platos disponibles
- Tener máximo 4 oraciones cortas`,
            },
        ]);

        return { systemPrompt: prompt.trim() };
    }

    // ── Menu ─────────────────────────────────────────────────────────────────

    @Get('places/:id/menu')
    async getMenu(@CurrentUser() user: any, @Param('id') id: string) {
        const place = await this.placesRepo.findOne({ where: { id } });
        if (!place) throw new NotFoundException('Local no encontrado');
        if (place.claimedByUserId !== user.id) throw new ForbiddenException('No tienes permiso para gestionar este local');
        return this.menuService.getMenu(id);
    }

    @Post('places/:id/menu/categories')
    async createCategory(@CurrentUser() user: any, @Param('id') id: string, @Body() body: any) {
        const place = await this.placesRepo.findOne({ where: { id } });
        if (!place) throw new NotFoundException('Local no encontrado');
        if (place.claimedByUserId !== user.id) throw new ForbiddenException('No tienes permiso para gestionar este local');
        return this.menuService.createCategory(id, body);
    }

    @Patch('places/:id/menu/categories/:categoryId')
    async updateCategory(@Param('categoryId') categoryId: string, @Body() body: any) {
        return this.menuService.updateCategory(categoryId, body);
    }

    @Delete('places/:id/menu/categories/:categoryId')
    async deleteCategory(@Param('categoryId') categoryId: string) {
        await this.menuService.deleteCategory(categoryId);
        return { message: 'Categoría eliminada' };
    }

    @Post('places/:id/menu/items')
    async createDish(@CurrentUser() user: any, @Param('id') id: string, @Body() body: any) {
        const place = await this.placesRepo.findOne({ where: { id } });
        if (!place) throw new NotFoundException('Local no encontrado');
        if (place.claimedByUserId !== user.id) throw new ForbiddenException('No tienes permiso para gestionar este local');
        return this.menuService.createDish(id, body);
    }

    @Patch('places/:id/menu/items/:dishId')
    async updateDish(@Param('dishId') dishId: string, @Body() body: any) {
        return this.menuService.updateDish(dishId, body);
    }

    @Delete('places/:id/menu/items/:dishId')
    async deleteDish(@Param('dishId') dishId: string) {
        await this.menuService.deleteDish(dishId);
        return { message: 'Plato eliminado' };
    }
}

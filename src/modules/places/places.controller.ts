import {
    Controller,
    Get,
    Post,
    Delete,
    Body,
    Param,
    Query,
    UseGuards,
    HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { PlacesService } from './places.service';
import { CreatePlaceSubmissionDto } from './dto/create-place-submission.dto';
import { CreatePlaceClaimDto } from './dto/create-place-claim.dto';
import { GetPlacesDto } from './dto/get-places.dto';
import { PlaceResponseDto } from './dto/place-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('places')
@Controller('places')
export class PlacesController {
    constructor(private readonly placesService: PlacesService) { }

    @Get()
    @ApiOperation({ summary: 'List active places with optional filters and geolocation' })
    @ApiResponse({ status: 200, type: PlaceResponseDto, isArray: true })
    async findAll(@Query() query: GetPlacesDto) {
        return this.placesService.findAll(query);
    }

    @Get('categories')
    @ApiOperation({ summary: 'Get all place categories' })
    @ApiResponse({ status: 200, description: 'Array of categories with id, name, slug and icon.' })
    async getCategories() {
        return this.placesService.getCategories();
    }

    @Get('discovery/different')
    @ApiOperation({ summary: 'Algo diferente — Trending / discovery places' })
    @ApiQuery({ name: 'district', required: false, type: String })
    @ApiQuery({ name: 'category', required: false, type: String })
    @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
    @ApiResponse({ status: 200, type: PlaceResponseDto, isArray: true })
    async getDiscovery(
        @Query('district') district?: string,
        @Query('category') category?: string,
        @Query('limit') limit?: number,
    ) {
        return this.placesService.getDiscovery(district, category, limit);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get full place details including dishes, photos, and reviews' })
    @ApiParam({ name: 'id', description: 'Place UUID' })
    @ApiResponse({ status: 200, type: PlaceResponseDto })
    @ApiResponse({ status: 404, description: 'Place not found.' })
    async findOne(@Param('id') id: string) {
        return this.placesService.findOne(id);
    }

    @Post('submit')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Submit a new place proposal for review' })
    @ApiResponse({ status: 201, description: 'Place submitted. Status: pending.' })
    @ApiResponse({ status: 401, description: 'Not authenticated.' })
    async submitPlaceShort(
        @CurrentUser() user: any,
        @Body() dto: CreatePlaceSubmissionDto,
    ) {
        return this.placesService.submitPlace(user.id, dto);
    }

    @Post('submissions')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Submit a new place proposal (legacy alias for /submit)' })
    @ApiResponse({ status: 201, description: 'Place submitted. Status: pending.' })
    @ApiResponse({ status: 401, description: 'Not authenticated.' })
    async submitPlace(
        @CurrentUser() user: any,
        @Body() dto: CreatePlaceSubmissionDto,
    ) {
        return this.placesService.submitPlace(user.id, dto);
    }

    @Post(':id/claim')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Claim a place as its business owner' })
    @ApiParam({ name: 'id', description: 'Place UUID' })
    @HttpCode(201)
    @ApiResponse({ status: 201, description: 'Claim submitted for admin review.' })
    @ApiResponse({ status: 401, description: 'Not authenticated.' })
    async claimPlace(
        @CurrentUser() user: any,
        @Param('id') id: string,
        @Body() dto: CreatePlaceClaimDto,
    ) {
        return this.placesService.claimPlace(user.id, id, dto);
    }

    @Post(':id/favorite')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Add place to favorites' })
    @ApiParam({ name: 'id', description: 'Place UUID' })
    @HttpCode(200)
    @ApiResponse({ status: 200, description: 'Place added to favorites.' })
    @ApiResponse({ status: 401, description: 'Not authenticated.' })
    async addFavorite(
        @CurrentUser() user: any,
        @Param('id') id: string,
    ) {
        await this.placesService.addFavorite(user.id, id);
        return { message: 'Lugar agregado a favoritos' };
    }

    @Delete(':id/favorite')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Remove place from favorites' })
    @ApiParam({ name: 'id', description: 'Place UUID' })
    @HttpCode(200)
    @ApiResponse({ status: 200, description: 'Place removed from favorites.' })
    @ApiResponse({ status: 401, description: 'Not authenticated.' })
    async removeFavorite(
        @CurrentUser() user: any,
        @Param('id') id: string,
    ) {
        await this.placesService.removeFavorite(user.id, id);
        return { message: 'Lugar eliminado de favoritos' };
    }
}

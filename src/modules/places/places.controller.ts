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
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
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
    @ApiOperation({ summary: 'List all active places with filters' })
    @ApiResponse({ type: PlaceResponseDto, isArray: true })
    async findAll(@Query() query: GetPlacesDto) {
        return this.placesService.findAll(query);
    }

    @Get('categories')
    @ApiOperation({ summary: 'Get all categories' })
    async getCategories() {
        return this.placesService.getCategories();
    }

    @Get('discovery/different')
    @ApiOperation({ summary: 'Algo diferente - Trending places' })
    @ApiResponse({ type: PlaceResponseDto, isArray: true })
    async getDiscovery(
        @Query('district') district?: string,
        @Query('category') category?: string,
        @Query('limit') limit?: number,
    ) {
        return this.placesService.getDiscovery(district, category, limit);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get place details' })
    @ApiResponse({ type: PlaceResponseDto })
    async findOne(@Param('id') id: string) {
        return this.placesService.findOne(id);
    }


    @Post('submit')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Submit a new place proposal' })
    async submitPlaceShort(
        @CurrentUser() user: any,
        @Body() dto: CreatePlaceSubmissionDto,
    ) {
        return this.placesService.submitPlace(user.id, dto);
    }

    @Post('submissions')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Submit a new place proposal (legacy)' })
    async submitPlace(
        @CurrentUser() user: any,
        @Body() dto: CreatePlaceSubmissionDto,
    ) {
        return this.placesService.submitPlace(user.id, dto);
    }

    @Post(':id/claim')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Claim a place as business owner' })
    @HttpCode(201)
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
    @HttpCode(200)
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
    @HttpCode(200)
    async removeFavorite(
        @CurrentUser() user: any,
        @Param('id') id: string,
    ) {
        await this.placesService.removeFavorite(user.id, id);
        return { message: 'Lugar eliminado de favoritos' };
    }
}

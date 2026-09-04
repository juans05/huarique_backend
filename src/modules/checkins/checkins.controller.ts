import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Body,
    Param,
    Query,
    UseGuards,
    HttpCode,
    DefaultValuePipe,
    ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { CheckinsService } from './checkins.service';
import { CreateCheckinDto } from './dto/create-checkin.dto';
import { AddDishDto } from './dto/add-dish.dto';
import { SubmitInfoSuggestionDto } from './dto/submit-info-suggestion.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PlaceTeamService } from '../team/place-team.service';

@ApiTags('checkins')
@Controller('checkins')
export class CheckinsController {
    constructor(
        private readonly checkinsService: CheckinsService,
        private readonly placeTeamService: PlaceTeamService,
    ) { }

    @Post()
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Create a new check-in' })
    @ApiResponse({ status: 201, description: 'Check-in created. May include unlocked badges.' })
    @ApiResponse({ status: 401, description: 'Not authenticated.' })
    async create(@CurrentUser() user: any, @Body() dto: CreateCheckinDto) {
        return this.checkinsService.create(user.id, dto);
    }

    @Get('feed/following')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Feed de check-ins de la gente que sigo' })
    @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
    @ApiQuery({ name: 'size', required: false, type: Number, example: 20 })
    async getFriendsFeed(
        @CurrentUser() user: any,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('size', new DefaultValuePipe(20), ParseIntPipe) size: number,
    ) {
        return this.checkinsService.getFriendsFeed(user.id, page, size);
    }

    @Get('feed')
    @ApiOperation({ summary: 'Get global feed of recent check-ins, optionally scoped to a single place' })
    @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
    @ApiQuery({ name: 'size', required: false, type: Number, example: 20 })
    @ApiQuery({ name: 'district', required: false, type: String, example: 'Miraflores' })
    @ApiQuery({ name: 'placeId', required: false, type: String, description: 'Filter check-ins/reviews to a single place' })
    @ApiQuery({ name: 'sort', required: false, enum: ['recent', 'top_rated', 'low_rated', 'most_liked'] })
    @ApiQuery({ name: 'hasPhotos', required: false, type: Boolean })
    @ApiResponse({ status: 200, description: 'Paginated list of recent check-ins.' })
    async getFeed(
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('size', new DefaultValuePipe(20), ParseIntPipe) size: number,
        @Query('district') district?: string,
        @Query('placeId') placeId?: string,
        @Query('sort') sort?: 'recent' | 'top_rated' | 'low_rated' | 'most_liked',
        @Query('hasPhotos') hasPhotos?: string,
        @CurrentUser() user?: any,
    ) {
        return this.checkinsService.getFeed(page, size, district, user?.id, placeId, sort, hasPhotos === 'true');
    }

    @Post(':id/like')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @HttpCode(200)
    @ApiOperation({ summary: 'Like a check-in' })
    @ApiParam({ name: 'id', description: 'Check-in UUID' })
    @ApiResponse({ status: 200, description: 'Like added. Returns updated likes count.' })
    @ApiResponse({ status: 401, description: 'Not authenticated.' })
    async like(@CurrentUser() user: any, @Param('id') id: string) {
        const likesCount = await this.checkinsService.like(user.id, id);
        return { message: 'Like agregado', likesCount };
    }

    @Delete(':id/like')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @HttpCode(200)
    @ApiOperation({ summary: 'Remove like from a check-in' })
    @ApiParam({ name: 'id', description: 'Check-in UUID' })
    @ApiResponse({ status: 200, description: 'Like removed. Returns updated likes count.' })
    @ApiResponse({ status: 401, description: 'Not authenticated.' })
    async unlike(@CurrentUser() user: any, @Param('id') id: string) {
        const likesCount = await this.checkinsService.unlike(user.id, id);
        return { message: 'Like eliminado', likesCount };
    }

    @Patch(':id/dish')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: '¿Qué pediste? — agregar el plato a un check-in ya hecho' })
    @ApiParam({ name: 'id', description: 'Check-in UUID' })
    async addDish(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: AddDishDto) {
        return this.checkinsService.addDish(user.id, id, dto.dishName, dto.dishPrice);
    }

    @Get('places/:placeId/top-dishes')
    @ApiOperation({ summary: 'Get most-ordered dishes for a place, from check-ins' })
    @ApiParam({ name: 'placeId', description: 'Place UUID' })
    async getTopDishes(@Param('placeId') placeId: string) {
        return this.checkinsService.getTopDishes(placeId);
    }

    @Get('business/places/:placeId/stats')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Check-in stats for the place owner (checkins this week/month, best day, top dish)' })
    @ApiParam({ name: 'placeId', description: 'Place UUID' })
    async getRestaurantStats(@Param('placeId') placeId: string, @CurrentUser() user: any) {
        await this.placeTeamService.assertAccess(user.id, placeId);
        return this.checkinsService.getRestaurantStats(placeId);
    }

    @Post('info-suggestions')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({
        summary:
            'Reportar un dato desactualizado de un local (teléfono, dirección o carta) al hacer check-in. Se aplica cuando 3 usuarios distintos coinciden.',
    })
    @ApiResponse({ status: 201, description: 'Voto registrado. Indica si ya se aplicó por consenso.' })
    async submitInfoSuggestion(@CurrentUser() user: any, @Body() dto: SubmitInfoSuggestionDto) {
        return this.checkinsService.submitInfoSuggestion(user.id, dto);
    }
}

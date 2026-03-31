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
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CheckinsService } from './checkins.service';
import { CreateCheckinDto } from './dto/create-checkin.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('checkins')
@Controller('checkins')
export class CheckinsController {
    constructor(private readonly checkinsService: CheckinsService) { }

    @Post()
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Create a new check-in' })
    async create(@CurrentUser() user: any, @Body() dto: CreateCheckinDto) {
        return this.checkinsService.create(user.id, dto);
    }

    @Get('feed')
    @ApiOperation({ summary: 'Get global feed of recent check-ins' })
    async getFeed(
        @Query('page') page?: number,
        @Query('size') size?: number,
        @Query('district') district?: string,
        @CurrentUser() user?: any,
    ) {
        return this.checkinsService.getFeed(page, size, district, user?.id);
    }

    @Post(':id/like')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @HttpCode(200)
    @ApiOperation({ summary: 'Like a check-in' })
    async like(@CurrentUser() user: any, @Param('id') id: string) {
        const likesCount = await this.checkinsService.like(user.id, id);
        return { message: 'Like agregado', likesCount };
    }

    @Delete(':id/like')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @HttpCode(200)
    @ApiOperation({ summary: 'Remove like from a check-in' })
    async unlike(@CurrentUser() user: any, @Param('id') id: string) {
        const likesCount = await this.checkinsService.unlike(user.id, id);
        return { message: 'Like eliminado', likesCount };
    }
}

import {
    Controller,
    Get,
    Post,
    Delete,
    Body,
    UseGuards,
    Query,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('subscriptions')
export class SubscriptionsController {
    constructor(private readonly service: SubscriptionsService) { }

    @Get('plans')
    getPlans() {
        return this.service.getPlans();
    }

    @UseGuards(JwtAuthGuard)
    @Post('subscribe')
    @HttpCode(HttpStatus.CREATED)
    subscribe(@CurrentUser() user: any, @Body() dto: CreateSubscriptionDto) {
        return this.service.createSubscription(user.id, dto.token, user.email, dto.tier);
    }

    @UseGuards(JwtAuthGuard)
    @Get('my')
    getMySubscription(@CurrentUser() user: any) {
        return this.service.getMySubscription(user.id);
    }

    @UseGuards(JwtAuthGuard)
    @Get('my/payments')
    getMyPayments(@CurrentUser() user: any) {
        return this.service.getMyPayments(user.id);
    }

    @UseGuards(JwtAuthGuard)
    @Delete('my')
    @HttpCode(HttpStatus.OK)
    cancelSubscription(@CurrentUser() user: any) {
        return this.service.cancelSubscription(user.id);
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin')
    @Get('admin/all')
    getAllSubscriptions(
        @Query('page') page = '1',
        @Query('limit') limit = '20',
    ) {
        return this.service.getAllSubscriptions(+page, +limit);
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin')
    @Get('admin/stats')
    getStats() {
        return this.service.getRevenueStats();
    }
}

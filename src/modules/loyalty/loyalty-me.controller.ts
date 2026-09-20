import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from '../users/users.service';
import { LoyaltyService } from './loyalty.service';

@ApiTags('loyalty')
@ApiBearerAuth()
@Controller('loyalty')
@UseGuards(JwtAuthGuard)
export class LoyaltyMeController {
  constructor(
    private readonly loyaltyService: LoyaltyService,
    private readonly usersService: UsersService,
  ) {}

  @Get('my-cards')
  @ApiOperation({ summary: "Get all of the current user's loyalty cards, across every restaurant" })
  async getMyCards(@Request() req) {
    const user = await this.usersService.findById(req.user.id);
    return this.loyaltyService.getMyCards(user.phone);
  }
}

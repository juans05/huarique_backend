import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { LoyaltyService } from './loyalty.service';

@ApiTags('loyalty-public')
@Controller('public/loyalty')
export class LoyaltyPublicController {
  constructor(private readonly loyaltyService: LoyaltyService) {}

  @Get(':placeId/program')
  @ApiOperation({ summary: 'Get loyalty program info for the NFC page (public)' })
  async getProgram(@Param('placeId') placeId: string) {
    return this.loyaltyService.getProgram(placeId);
  }

  @Post(':placeId/scan')
  @ApiOperation({ summary: 'Customer scans NFC — earn stamp or points (public)' })
  async scan(
    @Param('placeId') placeId: string,
    @Body() body: { phone: string; name?: string },
  ) {
    if (!body.phone) throw new Error('El número de teléfono es requerido');
    const phone = body.phone.replace(/\D/g, '');
    return this.loyaltyService.scan(placeId, phone, body.name);
  }

  @Get(':placeId/card/:phone')
  @ApiOperation({ summary: 'Get customer loyalty card (public — customer view)' })
  async getCard(@Param('placeId') placeId: string, @Param('phone') phone: string) {
    return this.loyaltyService.getCardWithProgram(placeId, phone);
  }

  @Get('card/:cardId/history')
  @ApiOperation({ summary: 'Get transaction history for a card (public)' })
  async getHistory(@Param('cardId') cardId: string) {
    return this.loyaltyService.getTransactions(cardId);
  }
}

import { Controller, Get, Post, Param, Body, Res, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { LoyaltyService } from './loyalty.service';
import { WalletService } from './wallet.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Place } from '../places/entities/place.entity';

@ApiTags('loyalty-public')
@Controller('public/loyalty')
export class LoyaltyPublicController {
  constructor(
    private readonly loyaltyService: LoyaltyService,
    private readonly walletService: WalletService,
    @InjectRepository(Place) private placesRepo: Repository<Place>,
  ) {}

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

  @Get(':placeId/wallet/google/:phone')
  @ApiOperation({ summary: 'Get Google Wallet save URL for loyalty card' })
  async googleWallet(@Param('placeId') placeId: string, @Param('phone') phone: string) {
    const { card, program } = await this.loyaltyService.getCardWithProgram(placeId, phone);
    if (!card) throw new NotFoundException('Tarjeta no encontrada');
    const place = await this.placesRepo.findOne({ where: { id: placeId } });
    const saveUrl = this.walletService.getGoogleWalletSaveUrl(place, card, program);
    return { saveUrl };
  }

  @Get(':placeId/wallet/apple/:phone')
  @ApiOperation({ summary: 'Download Apple Wallet .pkpass for loyalty card' })
  async appleWallet(
    @Param('placeId') placeId: string,
    @Param('phone') phone: string,
    @Res() res: Response,
  ) {
    const { card, program } = await this.loyaltyService.getCardWithProgram(placeId, phone);
    if (!card) throw new NotFoundException('Tarjeta no encontrada');
    const place = await this.placesRepo.findOne({ where: { id: placeId } });
    const buffer = await this.walletService.getAppleWalletPass(place, card, program);
    res.set({
      'Content-Type': 'application/vnd.apple.pkpass',
      'Content-Disposition': `attachment; filename="fidelizacion-${placeId}.pkpass"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }
}

import { Controller, Post, Get, Param, Body, UseGuards, HttpCode, HttpStatus, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Place } from '../places/entities/place.entity';
import { MetaAdsService } from './meta-ads.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Business Meta Ads Integration')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('business/meta-ads')
export class MetaAdsController {
  constructor(
    private readonly metaAdsService: MetaAdsService,
    @InjectRepository(Place)
    private placesRepo: Repository<Place>,
  ) {}

  private async assertOwner(placeId: string, userId: string) {
    const place = await this.placesRepo.findOne({ where: { id: placeId } });
    if (!place) throw new NotFoundException('Local no encontrado');
    if (place.claimedByUserId !== userId) throw new ForbiddenException('No tienes permiso para gestionar este local');
  }

  @ApiOperation({ summary: 'Obtiene el estado actual de la integración de Meta Ads' })
  @Get('place/:placeId/status')
  async getStatus(@CurrentUser() user: any, @Param('placeId') placeId: string) {
    await this.assertOwner(placeId, user.id);
    return await this.metaAdsService.getConnectionStatus(placeId);
  }

  @ApiOperation({ summary: 'Conecta/vincula las credenciales de Facebook Ads para el local' })
  @Post('place/:placeId/connect')
  async connect(
    @CurrentUser() user: any,
    @Param('placeId') placeId: string,
    @Body() body: { accessToken: string; adAccountId: string },
  ) {
    await this.assertOwner(placeId, user.id);
    return await this.metaAdsService.saveConnection(placeId, body);
  }

  @ApiOperation({ summary: 'Desconecta y borra los datos de integración de Meta Ads' })
  @Post('place/:placeId/disconnect')
  @HttpCode(HttpStatus.OK)
  async disconnect(@CurrentUser() user: any, @Param('placeId') placeId: string) {
    await this.assertOwner(placeId, user.id);
    return await this.metaAdsService.disconnectConnection(placeId);
  }

  @ApiOperation({ summary: 'Obtiene las cuentas publicitarias vinculadas a un token de Meta' })
  @Post('accounts')
  async getAccounts(@Body() body: { accessToken: string }) {
    return await this.metaAdsService.getAdAccounts(body.accessToken);
  }

  @ApiOperation({ summary: 'Fuerza una sincronización manual en tiempo real de los comensales con Meta' })
  @Post('place/:placeId/sync')
  @HttpCode(HttpStatus.OK)
  async syncAudience(@CurrentUser() user: any, @Param('placeId') placeId: string) {
    await this.assertOwner(placeId, user.id);
    return await this.metaAdsService.syncAudience(placeId);
  }
}

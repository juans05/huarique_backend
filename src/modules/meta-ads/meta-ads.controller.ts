import { Controller, Post, Get, Param, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { MetaAdsService } from './meta-ads.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Business Meta Ads Integration')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('business/meta-ads')
export class MetaAdsController {
  constructor(private readonly metaAdsService: MetaAdsService) {}

  @ApiOperation({ summary: 'Obtiene el estado actual de la integración de Meta Ads' })
  @Get('place/:placeId/status')
  async getStatus(@Param('placeId') placeId: string) {
    return await this.metaAdsService.getConnectionStatus(placeId);
  }

  @ApiOperation({ summary: 'Conecta/vincula las credenciales de Facebook Ads para el local' })
  @Post('place/:placeId/connect')
  async connect(
    @Param('placeId') placeId: string,
    @Body() body: { accessToken: string; adAccountId: string },
  ) {
    return await this.metaAdsService.saveConnection(placeId, body);
  }

  @ApiOperation({ summary: 'Desconecta y borra los datos de integración de Meta Ads' })
  @Post('place/:placeId/disconnect')
  @HttpCode(HttpStatus.OK)
  async disconnect(@Param('placeId') placeId: string) {
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
  async syncAudience(@Param('placeId') placeId: string) {
    return await this.metaAdsService.syncAudience(placeId);
  }
}

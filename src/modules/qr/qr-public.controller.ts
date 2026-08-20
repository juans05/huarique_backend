import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { QrService } from './qr.service';

@ApiTags('qr')
@Controller('qr')
export class QrPublicController {
    constructor(private readonly qrService: QrService) { }

    @Get(':token/resolve')
    @ApiOperation({ summary: 'Resuelve un token de QR a su destino actual (público, sin auth). Registra el escaneo.' })
    @ApiParam({ name: 'token' })
    async resolve(@Param('token') token: string) {
        return this.qrService.resolveByToken(token);
    }
}

import { IsString, IsOptional, IsUUID, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateEmailCampaignDto {
    @ApiProperty({ description: 'ID del restaurante/place' })
    @IsUUID()
    placeId: string;

    @ApiProperty({ example: 'Promoción de fin de semana' })
    @IsString()
    campaignName: string;

    @ApiProperty({ example: '¡No te pierdas nuestra oferta especial!' })
    @IsString()
    subject: string;

    @ApiProperty({ example: '<h1>Oferta especial</h1><p>Hola {nombre}, ven y disfruta...</p>' })
    @IsString()
    bodyHtml: string;

    @ApiPropertyOptional({ description: 'Fecha/hora futura para enviar la campaña automáticamente (ISO). Si no se envía, queda como DRAFT.' })
    @IsOptional()
    @IsDateString()
    scheduledAt?: string;
}

import { IsString, IsOptional, IsInt, Min, Max, IsBoolean, IsEmail } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePublicFeedbackDto {
    @ApiProperty({ example: 'uuid', description: 'ID del restaurante/place' })
    @IsString()
    placeId: string;

    @ApiProperty({ example: 3, minimum: 1, maximum: 5 })
    @IsInt()
    @Min(1)
    @Max(5)
    rating: number;

    @ApiPropertyOptional({ example: 'El servicio fue lento pero la comida estaba buena' })
    @IsOptional()
    @IsString()
    comment?: string;

    @ApiPropertyOptional({ example: 'Juan Pérez' })
    @IsOptional()
    @IsString()
    customerName?: string;

    @ApiPropertyOptional({ example: '+51 912345678 o email@example.com' })
    @IsOptional()
    @IsString()
    customerContact?: string;

    @ApiPropertyOptional({ example: 'uuid', description: 'ID del dispositivo (zona) desde donde se envía el feedback' })
    @IsOptional()
    @IsString()
    deviceId?: string;

    @ApiPropertyOptional({ example: true, description: 'Consentimiento para marketing y publicidad personalizada' })
    @IsOptional()
    @IsBoolean()
    marketingConsent?: boolean;
}

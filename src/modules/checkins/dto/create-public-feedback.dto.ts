import { IsString, IsOptional, IsInt, Min, Max, IsEmail } from 'class-validator';
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
}

import { Type } from 'class-transformer';
import {
    IsIn,
    IsLatitude,
    IsLongitude,
    IsNumber,
    IsOptional,
    IsString,
    IsUUID,
    MinLength,
    ValidateIf,
    ValidateNested,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { QrDestinationType } from '../entities/qr-assignment.entity';

export class NewPlaceDto {
    @IsString()
    @MinLength(2)
    name: string;

    @IsUUID()
    categoryId: string;

    @IsString()
    district: string;

    @IsOptional()
    @IsString()
    address?: string;

    @IsOptional()
    @IsString()
    phone?: string;

    @IsOptional()
    @IsNumber()
    @IsLatitude()
    latitude?: number;

    @IsOptional()
    @IsNumber()
    @IsLongitude()
    longitude?: number;
}

export class AssignQrDto {
    @ApiPropertyOptional({ description: 'Asignar a un local existente' })
    @IsOptional()
    @IsUUID()
    placeId?: string;

    @ApiPropertyOptional({ description: 'Crear el local en el momento (si no hay placeId)' })
    @IsOptional()
    @ValidateNested()
    @Type(() => NewPlaceDto)
    newPlace?: NewPlaceDto;

    @IsIn(Object.values(QrDestinationType))
    destinationType: QrDestinationType;

    @ValidateIf((dto: AssignQrDto) => dto.destinationType === QrDestinationType.CUSTOM_URL)
    @IsString()
    destinationUrl?: string;

    @ApiPropertyOptional({ description: 'Solo aplica al reasignar' })
    @IsOptional()
    @IsString()
    reason?: string;
}

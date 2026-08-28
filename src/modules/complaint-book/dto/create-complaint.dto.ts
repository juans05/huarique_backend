import { IsString, IsEmail, IsOptional, IsIn, IsNumber, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateComplaintDto {
    @ApiProperty({ enum: ['reclamo', 'queja'] })
    @IsIn(['reclamo', 'queja'])
    type: 'reclamo' | 'queja';

    @ApiProperty({ example: 'Juana Pérez Ríos' })
    @IsString()
    consumerFullName: string;

    @ApiProperty({ enum: ['DNI', 'CE', 'Pasaporte', 'RUC'] })
    @IsIn(['DNI', 'CE', 'Pasaporte', 'RUC'])
    consumerDocumentType: 'DNI' | 'CE' | 'Pasaporte' | 'RUC';

    @ApiProperty({ example: '45678912' })
    @IsString()
    consumerDocumentNumber: string;

    @ApiProperty({ example: 'Av. Larco 123, Miraflores, Lima' })
    @IsString()
    consumerAddress: string;

    @ApiProperty({ example: 'juana.perez@gmail.com' })
    @IsEmail()
    consumerEmail: string;

    @ApiPropertyOptional({ example: '+51 987654321' })
    @IsOptional()
    @IsString()
    consumerPhone?: string;

    @ApiProperty({ example: 'Plan Wuarike Fidelización+ (suscripción mensual)' })
    @IsString()
    contractedGood: string;

    @ApiPropertyOptional({ example: 149 })
    @IsOptional()
    @IsNumber()
    @Min(0)
    claimedAmount?: number;

    @ApiProperty({ example: 'Se me cobró dos veces el mismo mes sin autorización.' })
    @IsString()
    detail: string;

    @ApiProperty({ example: 'Solicito el reembolso del cobro duplicado.' })
    @IsString()
    consumerRequest: string;
}

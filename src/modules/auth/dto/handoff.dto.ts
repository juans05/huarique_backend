import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RedeemHandoffDto {
    @ApiProperty({ description: 'Código de traspaso que la app pidió a /auth/handoff' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(2000)
    code: string;
}

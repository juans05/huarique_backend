import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResendCodeDto {
    @ApiProperty({ example: 'user@example.com' })
    @IsEmail()
    email: string;
}

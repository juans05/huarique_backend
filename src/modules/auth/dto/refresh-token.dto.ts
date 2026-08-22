import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

// Fallback para cuando la cookie httpOnly no llega (frontend y backend en
// dominios distintos → SameSite=Strict nunca viaja cross-origin).
export class RefreshTokenDto {
    @ApiPropertyOptional({ description: 'Requerido solo si no llega la cookie refreshToken' })
    @IsOptional()
    @IsString()
    refreshToken?: string;
}

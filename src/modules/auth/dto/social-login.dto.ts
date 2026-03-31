import { IsString, IsEmail, IsOptional, IsUrl, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum SocialProvider {
    GOOGLE = 'google',
    FACEBOOK = 'facebook',
    INSTAGRAM = 'instagram',
}

export class SocialLoginDto {
    @ApiProperty({ enum: SocialProvider })
    @IsEnum(SocialProvider)
    provider: SocialProvider;

    @ApiProperty()
    @IsString()
    token: string; // Firebase token or Access Token from provider

    @ApiProperty()
    @IsEmail()
    email: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    name?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsUrl()
    photoUrl?: string;
}

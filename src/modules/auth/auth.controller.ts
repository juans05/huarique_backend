import { Controller, Post, Body, UseGuards, HttpCode, Res, Req, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendCodeDto } from './dto/resend-code.dto';
import { SocialLoginDto } from './dto/social-login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { IsPublic } from '../../common/decorators/is-public.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
    constructor(
        private readonly authService: AuthService,
        private configService: ConfigService,
    ) { }

    private setTokenCookies(res: Response, accessToken: string, refreshToken: string) {
        const isProduction = process.env.NODE_ENV === 'production';
        const cookieOptions = {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? 'strict' as const : 'lax' as const,
            path: '/',
        };
        res.cookie('accessToken', accessToken, {
            ...cookieOptions,
            maxAge: 15 * 60 * 1000, // 15 min
        });
        res.cookie('refreshToken', refreshToken, {
            ...cookieOptions,
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });
    }

    @Throttle({ default: { ttl: 60000, limit: 5 } })
    @Post('register')
    @ApiOperation({ summary: 'Register a new user' })
    @ApiResponse({ status: 201, description: 'User registered. Returns tokens + user.' })
    @ApiResponse({ status: 400, description: 'Validation error or email already in use.' })
    async register(@Body() registerDto: RegisterDto) {
        return this.authService.register(registerDto);
    }

    @Throttle({ default: { ttl: 60000, limit: 5 } })
    @Post('login')
    @HttpCode(200)
    @ApiOperation({ summary: 'Login with email and password' })
    @ApiResponse({ status: 200, description: 'Returns accessToken, refreshToken and user.' })
    @ApiResponse({ status: 401, description: 'Invalid credentials.' })
    async login(@Body() loginDto: LoginDto, @Res({ passthrough: true }) res: Response) {
        const result = await this.authService.login(loginDto);
        this.setTokenCookies(res, result.accessToken, result.refreshToken);
        return result;
    }

    @Post('verify-email')
    @HttpCode(200)
    @ApiOperation({ summary: 'Verify email with 6-digit code sent on registration' })
    @ApiResponse({ status: 200, description: 'Email verified successfully.' })
    @ApiResponse({ status: 400, description: 'Invalid or expired code.' })
    async verifyEmail(@Body() dto: VerifyEmailDto, @Res({ passthrough: true }) res: Response) {
        const result: any = await this.authService.verifyEmail(dto.email, dto.code);
        if (result.accessToken) {
            this.setTokenCookies(res, result.accessToken, result.refreshToken);
        }
        return result;
    }

    @IsPublic()
    @Throttle({ default: { ttl: 60000, limit: 3 } })
    @Post('forgot-password')
    @HttpCode(200)
    @ApiOperation({ summary: 'Request password reset code' })
    async forgotPassword(@Body() dto: ForgotPasswordDto) {
        return this.authService.forgotPassword(dto);
    }

    @IsPublic()
    @Post('reset-password')
    @HttpCode(200)
    @ApiOperation({ summary: 'Reset password with code' })
    async resetPassword(@Body() dto: ResetPasswordDto) {
        return this.authService.resetPassword(dto);
    }

    @IsPublic()
    @Throttle({ default: { ttl: 60000, limit: 3 } })
    @Post('resend-code')
    @HttpCode(200)
    @ApiOperation({ summary: 'Resend email verification code' })
    @ApiResponse({ status: 200, description: 'Code resent to email.' })
    @ApiResponse({ status: 404, description: 'User not found.' })
    async resendCode(@Body() dto: ResendCodeDto) {
        return this.authService.resendCode(dto.email);
    }

    @Post('social-login')
    @HttpCode(200)
    @ApiOperation({ summary: 'Login or register via Google / Facebook / Instagram' })
    @ApiResponse({ status: 200, description: 'Returns tokens and user. Creates account on first login.' })
    @ApiResponse({ status: 401, description: 'Invalid social token.' })
    async socialLogin(@Body() dto: SocialLoginDto) {
        return this.authService.socialLogin(
            dto.provider,
            dto.token,
            dto.email,
            dto.name,
            dto.photoUrl,
        );
    }

    @Post('refresh')
    @HttpCode(200)
    @ApiOperation({ summary: 'Get new access token using refresh token' })
    @ApiResponse({ status: 200, description: 'Returns new accessToken and refreshToken.' })
    @ApiResponse({ status: 401, description: 'Refresh token invalid or expired.' })
    @Post('refresh-cookie')
    @HttpCode(200)
    @ApiOperation({ summary: 'Refresh tokens using httpOnly cookie' })
    @ApiResponse({ status: 200, description: 'New tokens set as cookies.' })
    @ApiResponse({ status: 401, description: 'No refresh token cookie.' })
    async refreshFromCookie(@Res({ passthrough: true }) res: Response, @Req() req: any) {
        const refreshToken = req.cookies?.refreshToken;
        if (!refreshToken) {
            throw new UnauthorizedException('No refresh token cookie');
        }
        const result = await this.authService.refreshTokens(refreshToken);
        this.setTokenCookies(res, result.accessToken, result.refreshToken);
        return { message: 'Tokens refreshed' };
    }

    @Post('refresh')
    @HttpCode(200)
    @ApiOperation({ summary: 'Get new access token using refresh token' })
    @ApiResponse({ status: 200, description: 'Returns new accessToken and refreshToken.' })
    @ApiResponse({ status: 401, description: 'Refresh token invalid or expired.' })
    async refresh(@Body() refreshTokenDto: RefreshTokenDto, @Res({ passthrough: true }) res: Response) {
        const result = await this.authService.refreshTokens(refreshTokenDto.refreshToken);
        this.setTokenCookies(res, result.accessToken, result.refreshToken);
        return result;
    }

    @Post('logout')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @HttpCode(204)
    @ApiOperation({ summary: 'Logout and invalidate tokens' })
    @ApiResponse({ status: 204, description: 'Logged out successfully.' })
    @ApiResponse({ status: 401, description: 'Not authenticated.' })
    async logout(@CurrentUser() user: any, @Res({ passthrough: true }) res: Response) {
        await this.authService.logout(user.id);
        res.clearCookie('accessToken', { path: '/' });
        res.clearCookie('refreshToken', { path: '/' });
    }

}

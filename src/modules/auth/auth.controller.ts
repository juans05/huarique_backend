import { Controller, Post, Body, UseGuards, HttpCode } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendCodeDto } from './dto/resend-code.dto';
import { SocialLoginDto } from './dto/social-login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post('register')
    @ApiOperation({ summary: 'Register a new user' })
    @ApiResponse({ status: 201, description: 'User registered. Returns tokens + user.' })
    @ApiResponse({ status: 400, description: 'Validation error or email already in use.' })
    async register(@Body() registerDto: RegisterDto) {
        return this.authService.register(registerDto);
    }

    @Post('login')
    @HttpCode(200)
    @ApiOperation({ summary: 'Login with email and password' })
    @ApiResponse({ status: 200, description: 'Returns accessToken, refreshToken and user.' })
    @ApiResponse({ status: 401, description: 'Invalid credentials.' })
    async login(@Body() loginDto: LoginDto) {
        return this.authService.login(loginDto);
    }

    @Post('verify-email')
    @HttpCode(200)
    @ApiOperation({ summary: 'Verify email with 6-digit code sent on registration' })
    @ApiResponse({ status: 200, description: 'Email verified successfully.' })
    @ApiResponse({ status: 400, description: 'Invalid or expired code.' })
    async verifyEmail(@Body() dto: VerifyEmailDto) {
        return this.authService.verifyEmail(dto.email, dto.code);
    }

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
    async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
        return this.authService.refreshTokens(refreshTokenDto.refreshToken);
    }

    @Post('logout')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @HttpCode(204)
    @ApiOperation({ summary: 'Logout and invalidate tokens' })
    @ApiResponse({ status: 204, description: 'Logged out successfully.' })
    @ApiResponse({ status: 401, description: 'Not authenticated.' })
    async logout(@CurrentUser() user: any) {
        await this.authService.logout(user.id);
    }
}

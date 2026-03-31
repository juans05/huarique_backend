import { Injectable, UnauthorizedException, ConflictException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
    constructor(
        private usersService: UsersService,
        private jwtService: JwtService,
        private configService: ConfigService,
        @InjectRepository(RefreshToken)
        private refreshTokenRepository: Repository<RefreshToken>,
    ) { }

    async register(registerDto: RegisterDto) {
        const existingUser = await this.usersService.findByEmail(registerDto.email);
        if (existingUser) {
            throw new ConflictException('El email ya está registrado');
        }

        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

        await this.usersService.create(
            registerDto.email,
            registerDto.password,
            registerDto.fullName,
            false, // isVerified
            verificationCode,
        );

        // TODO: Send email with verificationCode
        console.log(`[EMAIL] Verification code for ${registerDto.email}: ${verificationCode}`);

        return {
            message: 'Código de verificación enviado al correo',
        };
    }

    async verifyEmail(email: string, code: string) {
        const user = await this.usersService.findByEmail(email);
        if (!user) {
            throw new UnauthorizedException('Usuario no encontrado');
        }

        if (user.isVerified) {
            return { message: 'Cuenta ya verificada' };
        }

        if (user.verificationCode !== code || user.verificationCodeExpiresAt < new Date()) {
            throw new UnauthorizedException('Código inválido o expirado');
        }

        await this.usersService.markVerified(user.id);

        const tokens = await this.generateTokens(user.id, user.email, user.role);
        return {
            user: { ...user, isVerified: true },
            ...tokens,
        };
    }

    async resendCode(email: string) {
        const user = await this.usersService.findByEmail(email);
        if (!user) {
            throw new NotFoundException('Usuario no encontrado');
        }

        if (user.isVerified) {
            return { message: 'Cuenta ya verificada' };
        }

        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        await this.usersService.setVerificationCode(user.id, verificationCode);

        // TODO: Send email
        console.log(`[EMAIL] Resent verification code for ${email}: ${verificationCode}`);

        return { message: 'Nuevo código enviado' };
    }

    async socialLogin(provider: string, token: string, email: string, name?: string, photoUrl?: string) {
        // Verify token with Firebase Admin SDK?
        // For now, trusting the frontend sent valid data or just simple check.
        // Ideally verify `token` against provider.

        let user = await this.usersService.findByEmail(email);

        if (user) {
            // Update social info
            await this.usersService.updateFromSocial(user.id, provider, email, photoUrl); // using email as socialId mostly valid for firebase
        } else {
            // Create verified user
            user = await this.usersService.create(
                email,
                Math.random().toString(36), // Random password
                name || 'Usuario',
                true, // isVerified
                undefined,
                provider,
                email // socialId
            );
            if (photoUrl) {
                await this.usersService.updateFromSocial(user.id, provider, email, photoUrl);
            }
        }

        const tokens = await this.generateTokens(user.id, user.email, user.role);
        return {
            user: { ...user, isVerified: true },
            ...tokens,
        };
    }

    async login(loginDto: LoginDto) {
        const user = await this.usersService.findByEmail(loginDto.email);
        if (!user) {
            throw new UnauthorizedException('Credenciales inválidas');
        }

        const isPasswordValid = await this.usersService.validatePassword(
            user,
            loginDto.password,
        );
        if (!isPasswordValid) {
            throw new UnauthorizedException('Credenciales inválidas');
        }

        if (!user.isVerified) {
            throw new UnauthorizedException('Debes verificar tu correo electrónico antes de ingresar');
        }

        await this.usersService.updateLastLogin(user.id);

        const tokens = await this.generateTokens(user.id, user.email, user.role);

        return {
            user: {
                id: user.id,
                email: user.email,
                fullName: user.fullName,
                role: user.role,
            },
            ...tokens,
        };
    }

    async refreshTokens(refreshToken: string) {
        const storedToken = await this.refreshTokenRepository.findOne({
            where: { token: refreshToken },
            relations: ['user'],
        });

        if (!storedToken) {
            throw new UnauthorizedException('Token inválido');
        }

        if (storedToken.expiresAt < new Date()) {
            await this.refreshTokenRepository.remove(storedToken);
            throw new UnauthorizedException('Token expirado');
        }

        // Remove old token
        await this.refreshTokenRepository.remove(storedToken);

        // Generate new tokens
        const tokens = await this.generateTokens(
            storedToken.user.id,
            storedToken.user.email,
            storedToken.user.role,
        );

        return tokens;
    }

    async logout(userId: string) {
        await this.refreshTokenRepository.delete({ userId });
    }

    private async generateTokens(userId: string, email: string, role: string) {
        const [accessToken, refreshToken] = await Promise.all([
            this.jwtService.signAsync(
                { sub: userId, email, role },
                {
                    secret: this.configService.get('JWT_SECRET'),
                    expiresIn: this.configService.get('JWT_EXPIRES_IN'),
                },
            ),
            this.jwtService.signAsync(
                { sub: userId, email, role },
                {
                    secret: this.configService.get('JWT_REFRESH_SECRET'),
                    expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN'),
                },
            ),
        ]);

        // Store refresh token
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

        await this.refreshTokenRepository.save({
            userId,
            token: refreshToken,
            expiresAt,
        });

        // Clean up expired tokens
        await this.refreshTokenRepository.delete({
            expiresAt: LessThan(new Date()),
        });

        return {
            accessToken,
            refreshToken,
        };
    }
}

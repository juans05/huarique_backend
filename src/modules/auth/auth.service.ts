import { Injectable, UnauthorizedException, ConflictException, NotFoundException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import axios from 'axios';
import { UsersService } from '../users/users.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { MailService } from '../../common/services/mail.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import * as bcrypt from 'bcryptjs';

const MAX_CODE_FAILURES = 5;
/** Código de 6 dígitos con un generador criptográfico (Math.random es predecible). */
export const newCode = () => randomInt(100000, 1000000).toString();

function getDeviceLabel(userAgent?: string): string {
    if (!userAgent) return 'Desconocido';
    return /Mobile|Android|iPhone/i.test(userAgent) ? 'Mobile' : 'Desktop';
}

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);
    private readonly codeFailures = new Map<string, number>();

    constructor(
        private usersService: UsersService,
        private jwtService: JwtService,
        private configService: ConfigService,
        private mailService: MailService,
        @InjectRepository(RefreshToken)
        private refreshTokenRepository: Repository<RefreshToken>,
    ) { }

    async register(registerDto: RegisterDto) {
        const existingUser = await this.usersService.findByEmail(registerDto.email);
        if (existingUser) {
            throw new ConflictException('El email ya está registrado');
        }

        const verificationCode = newCode();

        await this.usersService.create(
            registerDto.email,
            registerDto.password,
            registerDto.fullName,
            false, // isVerified
            verificationCode,
        );

        await this.mailService.sendVerificationCode(registerDto.email, verificationCode);

        return {
            message: 'Código de verificación enviado al correo',
        };
    }

    async verifyEmail(email: string, code: string, userAgent?: string) {
        const user = await this.usersService.findByEmail(email);
        if (!user) {
            throw new UnauthorizedException('Usuario no encontrado');
        }

        if (user.isVerified) {
            return { message: 'Cuenta ya verificada' };
        }

        await this.checkCode(user, code);

        await this.usersService.markVerified(user.id);

        const tokens = await this.generateTokens(
            user.id,
            user.email,
            user.role,
            getDeviceLabel(userAgent),
        );
        return {
            user: {
                id: user.id,
                email: user.email,
                fullName: user.fullName,
                role: user.role,
                isVerified: true,
            },
            ...tokens,
        };
    }

    async resendCode(email: string) {
        const user = await this.usersService.findByEmail(email);
        if (!user) {
            throw new NotFoundException('Usuario no encontrado ');
        }

        if (user.isVerified) {
            return { message: 'Cuenta ya verificada' };
        }

        const verificationCode = newCode();
        await this.usersService.setVerificationCode(user.id, verificationCode);
        this.codeFailures.delete(user.id);

        await this.mailService.sendVerificationCode(email, verificationCode);

        return { message: 'Nuevo código enviado' };
    }

    async socialLogin(
        provider: string,
        token: string,
        email?: string,
        name?: string,
        photoUrl?: string,
        userAgent?: string,
    ) {
        let verifiedEmail: string;
        let verifiedName: string | undefined = name;
        let socialId: string;

        if (provider === 'google') {
            // El login usa el cliente OAuth de siempre (el mismo que la app móvil y la web).
            // GOOGLE_CLIENT_ID pasó a ser el cliente de Google Business (reseñas), de otro
            // proyecto: aceptar ambos para no romper el login.
            const audience = [
                this.configService.get<string>('GOOGLE_LOGIN_CLIENT_ID'),
                this.configService.get<string>('NEXT_PUBLIC_GOOGLE_CLIENT_ID'),
                this.configService.get<string>('GOOGLE_CLIENT_ID'),
            ].filter((id): id is string => !!id);
            const client = new OAuth2Client();
            let payload;
            try {
                const ticket = await client.verifyIdToken({ idToken: token, audience });
                payload = ticket.getPayload();
            } catch {
                throw new UnauthorizedException('Token de Google inválido');
            }
            // Sin email verificado por Google, cualquiera podría entrar a la cuenta que ya usa ese correo.
            if (!payload?.email || payload.email_verified !== true) {
                throw new UnauthorizedException('Token de Google inválido');
            }
            verifiedEmail = payload.email;
            verifiedName = payload.name || name;
            socialId = payload.sub;
            photoUrl = payload.picture || photoUrl;
        } else if (provider === 'facebook') {
            const appId = this.configService.get('FACEBOOK_APP_ID');
            const appSecret = this.configService.get('FACEBOOK_APP_SECRET');
            if (!appId || !appSecret) {
                throw new UnauthorizedException('Login con Facebook no está configurado todavía');
            }
            try {
                const debugRes = await axios.get('https://graph.facebook.com/debug_token', {
                    params: { input_token: token, access_token: `${appId}|${appSecret}` },
                });
                const data = debugRes.data?.data;
                if (!data?.is_valid || String(data.app_id) !== String(appId)) {
                    throw new Error('invalid token');
                }
                socialId = data.user_id;

                const meRes = await axios.get('https://graph.facebook.com/me', {
                    params: { fields: 'id,name,email,picture', access_token: token },
                });
                if (!meRes.data?.email) {
                    throw new Error('facebook account has no email');
                }
                verifiedEmail = meRes.data.email;
                verifiedName = meRes.data.name || name;
                photoUrl = meRes.data.picture?.data?.url || photoUrl;
            } catch {
                throw new UnauthorizedException('Token de Facebook inválido');
            }
        } else {
            throw new UnauthorizedException('Proveedor social no soportado');
        }

        let user = await this.usersService.findBySocialId(provider, socialId);
        if (!user) {
            user = await this.usersService.findByEmail(verifiedEmail);
            if (user) {
                await this.usersService.linkSocialAccount(user.id, provider, socialId);
            } else {
                user = await this.usersService.create(
                    verifiedEmail,
                    randomBytes(24).toString('hex'),
                    verifiedName || verifiedEmail.split('@')[0],
                    true, // isVerified — the provider already verified this email
                    undefined,
                    provider,
                    socialId,
                );
            }
        }

        await this.usersService.updateLastLogin(user.id);
        const tokens = await this.generateTokens(
            user.id,
            user.email,
            user.role,
            getDeviceLabel(userAgent),
        );

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

    async forgotPassword(dto: ForgotPasswordDto) {
        const user = await this.usersService.findByEmail(dto.email);
        
        if (!user) {
            // Don't leak user existence?
            // Actually common to say "Check your email" regardless.
            return { message: 'Si el correo existe, se ha enviado un código   ' };
        }

        const resetCode = newCode();
        await this.usersService.setVerificationCode(user.id, resetCode);
        this.codeFailures.delete(user.id);

        await this.mailService.sendVerificationCode(user.email, resetCode);

        return { message: 'Código de recuperación enviado' };
    }

    async resetPassword(dto: ResetPasswordDto) {
        const user = await this.usersService.findByEmail(dto.email);
        if (!user) {
            throw new UnauthorizedException('Usuario no encontrado');
        }

        await this.checkCode(user, dto.code);

        const passwordHash = await bcrypt.hash(dto.password, 10);
        await this.usersService.updatePassword(user.id, passwordHash);
        // El código llegó a su correo, así que también prueba que el email es suyo.
        if (!user.isVerified) await this.usersService.markVerified(user.id);

        return { message: 'Contraseña actualizada exitosamente' };
    }

    async login(loginDto: LoginDto, userAgent?: string) {
        this.logger.log(`[AUTH] Attempting login for email: ${loginDto.email}`);
        const user = await this.usersService.findByEmail(loginDto.email);
        
        if (!user) {
            this.logger.warn(`[AUTH] Login failed: User not found for email ${loginDto.email}`);
            throw new UnauthorizedException('Credenciales inválidas');
        }

        this.logger.log(`[AUTH] User found: ${user.email} (Role: ${user.role}, Verified: ${user.isVerified})`);

        const isPasswordValid = await this.usersService.validatePassword(
            user,
            loginDto.password,
        );
        
        if (!isPasswordValid) {
            this.logger.warn(`[AUTH] Login failed: Invalid password for user ${user.email}`);
            throw new UnauthorizedException('Credenciales inválidas');
        }

        if (!user.isVerified) {
            this.logger.warn(`[AUTH] Login failed: User ${user.email} is not verified`);
            throw new UnauthorizedException('Debes verificar tu correo electrónico antes de ingresar');
        }

        this.logger.log(`[AUTH] Login successful for user: ${user.email}`);
        await this.usersService.updateLastLogin(user.id);

        const tokens = await this.generateTokens(
            user.id,
            user.email,
            user.role,
            getDeviceLabel(userAgent),
        );

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
        const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
        const storedToken = await this.refreshTokenRepository.findOne({
            where: { token: tokenHash },
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

        // Generate new tokens, preserving the device label across rotation
        const tokens = await this.generateTokens(
            storedToken.user.id,
            storedToken.user.email,
            storedToken.user.role,
            storedToken.deviceLabel,
        );

        return tokens;
    }

    async logout(userId: string) {
        await this.refreshTokenRepository.delete({ userId });
    }

    async listSessions(userId: string, currentRefreshToken?: string) {
        const currentHash = currentRefreshToken
            ? createHash('sha256').update(currentRefreshToken).digest('hex')
            : null;

        const sessions = await this.refreshTokenRepository.find({
            where: { userId },
            order: { createdAt: 'DESC' },
        });

        return sessions.map((s) => ({
            id: s.id,
            deviceLabel: s.deviceLabel ?? 'Desconocido',
            createdAt: s.createdAt,
            isCurrent: currentHash !== null && s.token === currentHash,
        }));
    }

    async revokeSession(userId: string, sessionId: string) {
        await this.refreshTokenRepository.delete({ id: sessionId, userId });
    }

    async revokeOtherSessions(userId: string, currentRefreshToken: string) {
        const currentHash = createHash('sha256').update(currentRefreshToken).digest('hex');
        const sessions = await this.refreshTokenRepository.find({ where: { userId } });
        const idsToRemove = sessions.filter((s) => s.token !== currentHash).map((s) => s.id);
        if (idsToRemove.length > 0) {
            await this.refreshTokenRepository.delete(idsToRemove);
        }
    }

    // Secreto propio: un código de traspaso no sirve como access token aunque se firme con el mismo JWT_SECRET.
    private handoffSecret() {
        return `${this.configService.get('JWT_SECRET')}:handoff`;
    }

    /** Código para abrir el panel web desde la app ya con sesión. Viaja en el # de la URL y vence en 60 s. */
    async createHandoffCode(userId: string) {
        // ponytail: reutilizable dentro de esos 60 s; si hace falta un solo uso, marcar el jti en Redis al canjear.
        const code = await this.jwtService.signAsync({ sub: userId }, { secret: this.handoffSecret(), expiresIn: 60 });
        return { code };
    }

    async redeemHandoffCode(code: string, userAgent?: string) {
        const payload = await this.jwtService.verifyAsync(code, { secret: this.handoffSecret() }).catch(() => null);
        if (!payload?.sub) throw new UnauthorizedException('El enlace venció. Vuelve a abrirlo desde la app.');
        const user = await this.usersService.findById(payload.sub).catch(() => null);
        if (!user) throw new UnauthorizedException('El enlace venció. Vuelve a abrirlo desde la app.');

        const tokens = await this.generateTokens(user.id, user.email, user.role, getDeviceLabel(userAgent));
        return {
            user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
            ...tokens,
        };
    }

    /**
     * Compara el código de 6 dígitos con tope de intentos: tras MAX_CODE_FAILURES fallos el código se anula
     * y hay que pedir otro. Sin esto, se podía adivinar a fuerza bruta solo con el límite global por IP.
     * ponytail: contador en memoria por instancia; pasarlo a Redis si se escala a varias réplicas.
     */
    private async checkCode(user: { id: string; verificationCode: string; verificationCodeExpiresAt: Date }, code: string) {
        const valid = !!user.verificationCode && user.verificationCodeExpiresAt >= new Date()
            && typeof code === 'string' && code.length === user.verificationCode.length
            && timingSafeEqual(Buffer.from(code), Buffer.from(user.verificationCode));
        if (valid) { this.codeFailures.delete(user.id); return; }
        const fails = (this.codeFailures.get(user.id) ?? 0) + 1;
        if (fails >= MAX_CODE_FAILURES) {
            this.codeFailures.delete(user.id);
            await this.usersService.setVerificationCode(user.id, null, 0);
        } else {
            this.codeFailures.set(user.id, fails);
        }
        throw new UnauthorizedException('Código inválido o expirado');
    }

    private async generateTokens(userId: string, email: string, role: string, deviceLabel?: string) {
        // Único punto donde se emiten sesiones: una cuenta baneada o borrada no obtiene tokens nuevos.
        const account = await this.usersService.findById(userId).catch(() => null);
        if (!account || account.isBanned || account.deletedAt) throw new UnauthorizedException('Cuenta no disponible');
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

        // Store refresh token (SHA-256 hashed)
        const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

        await this.refreshTokenRepository.save({
            userId,
            token: tokenHash,
            expiresAt,
            deviceLabel: deviceLabel ?? 'Desconocido',
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

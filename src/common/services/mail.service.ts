import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {
    private resend: Resend;
    private frontendUrl: string;

    constructor(private configService: ConfigService) {
        const apiKey = this.configService.get<string>('RESEND_API_KEY');
        this.resend = new Resend(apiKey);
        this.frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    }

    async sendWeeklyReport(email: string, chefName: string, stats: { reviews: number, visibilityChange: number }) {
        try {
            const { data, error } = await this.resend.emails.send({
                from: 'Wuarike <reports@wuarikes.com>',
                to: [email],
                subject: '📊 ¡Tu Reporte Semanal de Wuarike!',
                html: `
                    <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 20px; overflow: hidden; border: 1px solid #eee;">
                        <div style="background: linear-gradient(135deg, #ff4d4d, #ff9966); padding: 40px; text-align: center; color: white;">
                            <h1 style="margin: 0; font-size: 28px; font-weight: 900; letter-spacing: -1px;">¡Felicidades ${chefName}!</h1>
                            <p style="margin-top: 10px; opacity: 0.9; font-weight: bold; text-transform: uppercase; font-size: 12px; tracking: 2px;">Tu restaurante está brillando esta semana</p>
                        </div>
                        
                        <div style="padding: 40px;">
                            <div style="display: flex; gap: 20px; margin-bottom: 30px;">
                                <div style="flex: 1; background: #f9fafb; padding: 20px; border-radius: 15px; text-align: center; border: 1px solid #f0f2f5;">
                                    <div style="font-size: 32px; font-weight: 900; color: #ff4d4d;">${stats.reviews}</div>
                                    <div style="font-size: 10px; font-weight: 800; color: #9ca3af; text-transform: uppercase;">Nuevas Reseñas ⭐</div>
                                </div>
                                <div style="flex: 1; background: #f9fafb; padding: 20px; border-radius: 15px; text-align: center; border: 1px solid #f0f2f5;">
                                    <div style="font-size: 32px; font-weight: 900; color: #10b981;">+${stats.visibilityChange}%</div>
                                    <div style="font-size: 10px; font-weight: 800; color: #9ca3af; text-transform: uppercase;">Visibilidad en Maps 🗺️</div>
                                </div>
                            </div>

                            <p style="color: #4b5563; line-height: 1.6; font-size: 14px;">
                                Tu visibilidad en <strong>Google Maps</strong> ha subido notablemente gracias a las nuevas interacciones. Los clientes están amando tu comida y el sistema de Wuarike está filtrando las mejores experiencias para que luzcan en tu perfil oficial.
                            </p>

                            <a href="${this.frontendUrl}/reputacion" style="display: block; width: 100%; text-align: center; background: #111827; color: white; padding: 18px; border-radius: 12px; text-decoration: none; font-weight: 900; font-size: 12px; text-transform: uppercase; margin-top: 30px; letter-spacing: 1px;">Ver Dashboard Completo</a>
                        </div>

                        <div style="background: #f9fafb; padding: 20px; text-align: center; color: #9ca3af; font-size: 10px; font-weight: bold;">
                            &copy; ${new Date().getFullYear()} WUARIKE - SMART RESTAURANT ENGINE
                        </div>
                    </div>
                `,
            });

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error sending weekly report:', error);
            throw new InternalServerErrorException('Error al enviar reporte semanal');
        }
    }

    async sendMarketingEmail(to: string[], subject: string, htmlContent: string) {
        try {
            const { data, error } = await this.resend.emails.send({
                from: 'Wuarike Promociones <promociones@wuarikes.com>',
                to,
                subject,
                html: htmlContent,
            });

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error sending marketing email:', error);
            throw new InternalServerErrorException('Error al enviar correo promocional');
        }
    }

    async sendVerificationCode(email: string, code: string) {
        try {
            const { data, error } = await this.resend.emails.send({
                from: 'Wuarike <auth@wuarikes.com>',
                to: [email],
                subject: 'Tu código de verificación de Wuarike',
                html: `
                    <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 20px; text-align: center; border: 1px solid #eee;">
                        <h1 style="color: #111827; font-size: 24px; font-weight: 900; margin-bottom: 20px;">Verifica tu cuenta</h1>
                        <p style="color: #4b5563; font-size: 16px; margin-bottom: 30px;">Usa el siguiente código para completar tu registro o inicio de sesión:</p>
                        <div style="background: #f3f4f6; padding: 20px; border-radius: 12px; font-size: 32px; font-weight: 900; color: #ff4d4d; letter-spacing: 5px;">
                            ${code}
                        </div>
                        <p style="color: #9ca3af; font-size: 12px; margin-top: 30px;">Si no solicitaste este código, puedes ignorar este correo.</p>
                    </div>
                `,
            });

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error sending verification code:', error);
            throw new InternalServerErrorException('Error al enviar código de verificación');
        }
    }

    async sendTeamMemberPasswordReset(email: string, fullName: string, code: string, placeName: string) {
        try {
            const resetUrl = `${this.frontendUrl}/forgot-password?email=${encodeURIComponent(email)}&code=${code}`;
            const { data, error } = await this.resend.emails.send({
                from: 'Wuarike <auth@wuarikes.com>',
                to: [email],
                subject: `Te sumaron al equipo de ${placeName} en Wuarike`,
                html: `
                    <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 20px; border: 1px solid #eee;">
                        <h1 style="color: #111827; font-size: 22px; font-weight: 900; margin-bottom: 10px;">¡Hola ${fullName}!</h1>
                        <p style="color: #4b5563; font-size: 15px; margin-bottom: 20px;">
                            Te agregaron al equipo de <strong>${placeName}</strong> en Wuarike. Ya tenías una cuenta, así que por seguridad
                            necesitás confirmar una contraseña nueva antes de entrar:
                        </p>
                        <div style="text-align: center; margin-bottom: 20px;">
                            <a href="${resetUrl}" style="display: inline-block; background: #F26122; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 12px; font-weight: 700; font-size: 15px;">
                                Cambiar mi contraseña
                            </a>
                        </div>
                        <p style="color: #9ca3af; font-size: 12px;">Si el botón no funciona, copiá y pegá este link en tu navegador: ${resetUrl}</p>
                    </div>
                `,
            });

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error sending team member password reset:', error);
            throw new InternalServerErrorException('Error al enviar el correo de cambio de contraseña');
        }
    }

    async sendTeamMemberCredentials(email: string, fullName: string, password: string, placeName: string, role: string) {
        try {
            const { data, error } = await this.resend.emails.send({
                from: 'Wuarike <auth@wuarikes.com>',
                to: [email],
                subject: `Te sumaron al equipo de ${placeName} en Wuarike`,
                html: `
                    <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 20px; border: 1px solid #eee;">
                        <h1 style="color: #111827; font-size: 22px; font-weight: 900; margin-bottom: 10px;">¡Hola ${fullName}!</h1>
                        <p style="color: #4b5563; font-size: 15px; margin-bottom: 20px;">
                            Te agregaron al equipo de <strong>${placeName}</strong> en Wuarike con el rol de <strong>${role}</strong>.
                            Ya podés ingresar al panel con estas credenciales:
                        </p>
                        <div style="background: #f3f4f6; padding: 20px; border-radius: 12px; margin-bottom: 20px;">
                            <p style="margin: 0 0 8px 0; font-size: 13px; color: #6b7280;">Email</p>
                            <p style="margin: 0 0 16px 0; font-size: 16px; font-weight: 700; color: #111827;">${email}</p>
                            <p style="margin: 0 0 8px 0; font-size: 13px; color: #6b7280;">Contraseña temporal</p>
                            <p style="margin: 0; font-size: 16px; font-weight: 700; color: #111827; font-family: monospace;">${password}</p>
                        </div>
                        <p style="color: #9ca3af; font-size: 12px;">Te recomendamos cambiar la contraseña después de tu primer ingreso.</p>
                    </div>
                `,
            });

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error sending team member credentials:', error);
            throw new InternalServerErrorException('Error al enviar el correo de credenciales');
        }
    }
}

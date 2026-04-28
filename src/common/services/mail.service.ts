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
                from: 'Wuarike <reports@resend.dev>',
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

    async sendVerificationCode(email: string, code: string) {
        try {
            const { data, error } = await this.resend.emails.send({
                from: 'Wuarike <auth@resend.dev>',
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
}

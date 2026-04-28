import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Place } from '../entities/place.entity';
import { User } from '../../users/entities/user.entity';
import { MailService } from '../../../common/services/mail.service';

@Injectable()
export class WeeklyReportService {
  private readonly logger = new Logger(WeeklyReportService.name);

  constructor(
    @InjectRepository(Place)
    private placesRepo: Repository<Place>,
    @InjectRepository(User)
    private usersRepo: Repository<User>,
    private mailService: MailService,
  ) {}

  // Se ejecuta todos los lunes a las 8:00 AM
  @Cron(CronExpression.EVERY_MONDAY_AT_8AM)
  async handleWeeklyReports() {
    this.logger.log('Iniciando envío de reportes semanales...');

    const places = await this.placesRepo.find({
      where: { status: 'active' },
      relations: ['claimedByUser'],
    });

    for (const place of places) {
      if (place.claimedByUserId && place.claimedByUser?.email) {
        try {
          // Aquí calcularíamos las estadísticas reales de la última semana
          // Por ahora simulamos los datos según el pedido del usuario
          const stats = {
            reviews: 5, // Simulado: Sería un count de reseñas de los últimos 7 días
            visibilityChange: 12, // Simulado: Basado en la subida de rating o taps
          };

          await this.mailService.sendWeeklyReport(
            place.claimedByUser.email,
            place.claimedByUser.fullName || 'Chef',
            stats
          );
          
          this.logger.log(`Reporte enviado a ${place.claimedByUser.email} para ${place.name}`);
        } catch (error) {
          this.logger.error(`Error enviando reporte a ${place.claimedByUser.email}: ${error.message}`);
        }
      }
    }
  }

  /**
   * Método manual para probar el envío
   */
  async triggerManualReport(placeId: string) {
    const place = await this.placesRepo.findOne({
      where: { id: placeId },
      relations: ['claimedByUser'],
    });

    if (place?.claimedByUser?.email) {
      await this.mailService.sendWeeklyReport(
        place.claimedByUser.email,
        place.claimedByUser.fullName || 'Chef',
        { reviews: 5, visibilityChange: 12 }
      );
      return { message: 'Reporte enviado manualmente' };
    }
    throw new Error('No se encontró el dueño o el correo');
  }
}

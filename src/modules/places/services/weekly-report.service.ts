import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Place } from '../entities/place.entity';
import { User } from '../../users/entities/user.entity';
import { MailService } from '../../../common/services/mail.service';
import { computeWeeklyStats, hasActivity } from './weekly-stats';

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
  @Cron('0 0 8 * * 1')
  async handleWeeklyReports() {
    this.logger.log('Iniciando envío de reportes semanales...');

    const places = await this.placesRepo.find({
      where: { status: 'active' },
      relations: ['claimedBy'],
    });

    for (const place of places) {
      if (place.claimedByUserId && place.claimedBy?.email) {
        try {
          // Solo datos reales de los últimos 7 días; si el local no tuvo actividad no se le escribe.
          const stats = await computeWeeklyStats(this.placesRepo.manager, place.id);
          if (!hasActivity(stats)) continue;

          await this.mailService.sendWeeklyReport(
            place.claimedBy.email,
            place.claimedBy.fullName || 'Chef',
            place.name,
            stats,
          );
          
          this.logger.log(`Reporte enviado a ${place.claimedBy.email} para ${place.name}`);
        } catch (error) {
          this.logger.error(`Error enviando reporte a ${place.claimedBy.email}: ${error.message}`);
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
      relations: ['claimedBy'],
    });

    if (place?.claimedBy?.email) {
      await this.mailService.sendWeeklyReport(
        place.claimedBy.email,
        place.claimedBy.fullName || 'Chef',
        place.name,
        await computeWeeklyStats(this.placesRepo.manager, place.id),
      );
      return { message: 'Reporte enviado manualmente' };
    }
    throw new Error('No se encontró el dueño o el correo');
  }
}

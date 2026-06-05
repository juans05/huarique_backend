import { Controller, Post, Body, UseGuards, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ChatProcessorService } from './chat-processor.service';
import { Place } from '../places/entities/place.entity';

@UseGuards(JwtAuthGuard)
@Controller('plazbot-setup')
export class DemoChatController {
  constructor(
    private chatProcessor: ChatProcessorService,
    @InjectRepository(Place)
    private placesRepo: Repository<Place>,
  ) {}

  private async assertOwner(placeId: string, userId: string) {
    const place = await this.placesRepo.findOne({ where: { id: placeId } });
    if (!place) throw new NotFoundException('Local no encontrado');
    if (place.claimedByUserId !== userId) throw new ForbiddenException('No tienes permiso');
  }

  @Post('demo-chat')
  async demoChat(
    @CurrentUser() user: any,
    @Body() dto: {
      placeId: string;
      message: string;
      history?: { role: 'user' | 'assistant'; content: string }[];
    },
  ) {
    await this.assertOwner(dto.placeId, user.id);
    const response = await this.chatProcessor.processDemoMessage(
      dto.placeId,
      dto.message,
      dto.history || [],
    );
    return { response };
  }
}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation } from '../whatsapp/entities/conversation.entity';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { TeamModule } from '../team/team.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([Conversation]),
        TeamModule,
    ],
    providers: [ReportsService],
    controllers: [ReportsController],
})
export class ReportsModule {}

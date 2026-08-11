import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiAgentController } from './ai-agent.controller';
import { AiAgentService } from './ai-agent.service';
import { KnowledgeBase } from '../ai/entities/knowledge-base.entity';
import { KnowledgeBaseChunk } from '../ai/entities/knowledge-base-chunk.entity';
import { AiModule } from '../ai/ai.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { TeamModule } from '../team/team.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([KnowledgeBase, KnowledgeBaseChunk]),
        AiModule,
        SubscriptionsModule,
        TeamModule,
    ],
    controllers: [AiAgentController],
    providers: [AiAgentService],
    exports: [AiAgentService, TypeOrmModule]
})
export class AiAgentModule {}

import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiService } from './ai.service';
import { VectorService } from './vector.service';
import { KnowledgeBase } from './entities/knowledge-base.entity';
import { KnowledgeBaseChunk } from './entities/knowledge-base-chunk.entity';

@Global()
@Module({
    imports: [TypeOrmModule.forFeature([KnowledgeBase, KnowledgeBaseChunk])],
    providers: [AiService, VectorService],
    exports: [AiService, VectorService, TypeOrmModule],
})
export class AiModule {}

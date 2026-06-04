import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KnowledgeBase } from '../ai/entities/knowledge-base.entity';
import { KnowledgeBaseChunk } from '../ai/entities/knowledge-base-chunk.entity';
import { VectorService } from '../ai/vector.service';

@Injectable()
export class AiAgentService {
    private readonly logger = new Logger(AiAgentService.name);

    constructor(
        @InjectRepository(KnowledgeBase)
        private knowledgeBaseRepo: Repository<KnowledgeBase>,
        @InjectRepository(KnowledgeBaseChunk)
        private knowledgeBaseChunkRepo: Repository<KnowledgeBaseChunk>,
        private vectorService: VectorService
    ) {}

    async createKnowledgeBase(placeId: string, fileName: string, rawText: string): Promise<KnowledgeBase> {
        // 1. Create Knowledge Base record
        const kb = this.knowledgeBaseRepo.create({
            placeId,
            fileName,
            fileUrl: 'manual-upload'
        });
        const savedKb = await this.knowledgeBaseRepo.save(kb);

        if (!savedKb?.id) {
            throw new Error('No se pudo obtener el ID del knowledge base después de guardarlo');
        }

        this.logger.log(`[createKnowledgeBase] KB creado id=${savedKb.id} rawText.length=${rawText.length}`);

        // 2. Chunk the text
        const chunks = this.chunkText(rawText, 500, 50);
        this.logger.log(`[createKnowledgeBase] Chunks generados: ${chunks.length}`);

        if (chunks.length === 0) {
            this.logger.warn(`[createKnowledgeBase] El texto no generó ningún chunk — archivo posiblemente vacío`);
            return savedKb;
        }

        // 3. Generate embeddings and save chunks usando el repositorio TypeORM
        let savedCount = 0;
        for (const chunkText of chunks) {
            let embedding: number[] = [];
            try {
                embedding = await this.vectorService.generateEmbedding(chunkText);
            } catch (error) {
                this.logger.warn(`[createKnowledgeBase] Embedding falló, guardando sin vector: ${error?.message}`);
            }

            try {
                const chunk = this.knowledgeBaseChunkRepo.create({
                    knowledgeBaseId: savedKb.id,
                    chunkText,
                    embedding: JSON.stringify(embedding),
                });
                await this.knowledgeBaseChunkRepo.save(chunk);
                savedCount++;
            } catch (error) {
                this.logger.error(`[createKnowledgeBase] Error guardando chunk: ${error?.message}`);
                throw new Error(`Error guardando fragmento en la base de datos: ${error?.message}`);
            }
        }

        this.logger.log(`[createKnowledgeBase] Completado: ${savedCount}/${chunks.length} chunks guardados`);

        return savedKb;
    }

    async getKnowledgeBases(placeId: string): Promise<any[]> {
        const bases = await this.knowledgeBaseRepo.find({
            where: { placeId },
            order: { createdAt: 'DESC' }
        });

        // Count chunks for each KB
        const result = await Promise.all(
            bases.map(async (kb) => {
                const chunkCount = await this.knowledgeBaseChunkRepo.count({
                    where: { knowledgeBaseId: kb.id }
                });
                return {
                    ...kb,
                    chunkCount
                };
            })
        );

        return result;
    }

    async deleteKnowledgeBase(kbId: string): Promise<void> {
        // Delete chunks first (or rely on FK CASCADE)
        await this.knowledgeBaseChunkRepo.delete({ knowledgeBaseId: kbId });
        // Then delete the KB
        await this.knowledgeBaseRepo.delete({ id: kbId });
    }

    private chunkText(text: string, chunkSize: number = 500, overlap: number = 50): string[] {
        const chunks: string[] = [];
        let start = 0;

        while (start < text.length) {
            let end = start + chunkSize;

            // Try to break at sentence boundary (period + space)
            if (end < text.length) {
                const lastPeriod = text.lastIndexOf('.', end);
                if (lastPeriod > start + chunkSize * 0.7) {
                    end = lastPeriod + 1;
                }
            }

            const chunk = text.substring(start, end).trim();
            if (chunk.length > 0) {
                chunks.push(chunk);
            }

            // Move start position with overlap
            start = end - overlap;
        }

        return chunks;
    }
}

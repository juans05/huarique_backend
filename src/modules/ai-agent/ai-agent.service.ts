import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KnowledgeBase } from '../ai/entities/knowledge-base.entity';
import { KnowledgeBaseChunk } from '../ai/entities/knowledge-base-chunk.entity';
import { VectorService } from '../ai/vector.service';

@Injectable()
export class AiAgentService {
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

        // 2. Chunk the text (500 chars with 50 char overlap)
        const chunks = this.chunkText(rawText, 500, 50);

        // 3. Generate embeddings and save chunks usando el repositorio TypeORM
        // (evita mismatch de schema entre TypeORM y SQL raw)
        for (const chunkText of chunks) {
            let embedding: number[] = [];
            try {
                embedding = await this.vectorService.generateEmbedding(chunkText);
            } catch (error) {
                console.error(`Error generando embedding, guardando chunk sin vector:`, error?.message);
            }

            const chunk = this.knowledgeBaseChunkRepo.create({
                knowledgeBaseId: savedKb.id,
                chunkText,
                embedding: JSON.stringify(embedding),
            });
            await this.knowledgeBaseChunkRepo.save(chunk);
        }

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

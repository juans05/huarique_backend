import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import OpenAI from 'openai';
import { ConfigService } from '@nestjs/config';
import { KnowledgeBase } from './entities/knowledge-base.entity';
import { KnowledgeBaseChunk } from './entities/knowledge-base-chunk.entity';

@Injectable()
export class VectorService {
    private openaiClient: OpenAI;

    constructor(
        private dataSource: DataSource,
        private configService: ConfigService,
        @InjectRepository(KnowledgeBase)
        private kbRepo: Repository<KnowledgeBase>,
        @InjectRepository(KnowledgeBaseChunk)
        private chunkRepo: Repository<KnowledgeBaseChunk>,
    ) {
        // Use OpenRouter configured in Wuarikes for embeddings
        this.openaiClient = new OpenAI({
            apiKey: this.configService.get<string>('OPENROUTER_API_KEY'),
            baseURL: 'https://openrouter.ai/api/v1',
            defaultHeaders: {
                'HTTP-Referer': this.configService.get<string>('FRONTEND_URL') || 'https://warike.up.railway.app',
                'X-Title': 'Warike',
            },
        });
    }

    // Generate vector representation (1536 floats) using openrouter model
    async generateEmbedding(text: string): Promise<number[]> {
        const response = await this.openaiClient.embeddings.create({
            model: 'text-embedding-3-small',
            input: text
        });
        return response.data[0].embedding;
    }

    // Save indexed chunk to DB (Vector serialized as JSON string in TEXT column)
    async saveChunk(knowledgeBaseId: string, text: string, embedding: number[]) {
        const vectorString = JSON.stringify(embedding);
        await this.dataSource.query(
            `INSERT INTO knowledge_base_chunks (knowledge_base_id, chunk_text, embedding)
             VALUES ($1, $2, $3)`,
            [knowledgeBaseId, text, vectorString]
        );
    }

    // Semantic cosine similarity search in memory (100% Postgres compatible)
    async searchSimilarity(placeId: string, queryText: string, limit = 15): Promise<string[]> {
        let queryEmbedding: number[];
        try {
            queryEmbedding = await this.generateEmbedding(queryText);
        } catch (err) {
            console.error('[VectorService] Error generando embedding, usando fallback texto completo:', err?.message);
            return this.fetchAllChunks(placeId);
        }

        // Traer todos los chunks del restaurante via TypeORM (mismo schema que el save)
        const kbs = await this.kbRepo.find({ where: { placeId }, select: ['id'] });
        const kbIds = kbs.map(kb => kb.id);
        if (kbIds.length === 0) return [];

        const chunks = kbIds.length > 0
            ? await this.chunkRepo.createQueryBuilder('chunk')
                .where('chunk.knowledgeBaseId IN (:...ids)', { ids: kbIds })
                .select(['chunk.chunkText', 'chunk.embedding'])
                .getMany()
            : [];

        if (chunks.length === 0) return [];

        const cosineSimilarity = (vecA: number[], vecB: number[]): number => {
            let dot = 0, normA = 0, normB = 0;
            for (let i = 0; i < vecA.length; i++) {
                dot += vecA[i] * vecB[i];
                normA += vecA[i] * vecA[i];
                normB += vecB[i] * vecB[i];
            }
            if (normA === 0 || normB === 0) return 0;
            return dot / (Math.sqrt(normA) * Math.sqrt(normB));
        };

        const withEmbedding: { text: string; score: number }[] = [];
        const withoutEmbedding: string[] = [];

        for (const c of chunks) {
            try {
                const vec = JSON.parse(c.embedding);
                if (!Array.isArray(vec) || vec.length === 0) {
                    withoutEmbedding.push(c.chunkText);
                } else {
                    withEmbedding.push({ text: c.chunkText, score: cosineSimilarity(queryEmbedding, vec) });
                }
            } catch {
                withoutEmbedding.push(c.chunkText);
            }
        }

        // Ordenar por similitud y tomar los top N
        withEmbedding.sort((a, b) => b.score - a.score);
        const topSimilar = withEmbedding.slice(0, limit).map(c => c.text);

        // Incluir siempre los chunks sin embedding (texto puro) — pueden contener info importante
        const combined = [...topSimilar, ...withoutEmbedding];
        return combined.length > 0 ? combined : this.fetchAllChunks(placeId);
    }

    // Traer todos los chunks sin ranking — usado como fallback cuando no hay embeddings
    private async fetchAllChunks(placeId: string): Promise<string[]> {
        try {
            const kbs = await this.kbRepo.find({ where: { placeId }, select: ['id'] });
            const kbIds = kbs.map(kb => kb.id);
            if (kbIds.length === 0) return [];

            const chunks = await this.chunkRepo.createQueryBuilder('chunk')
                .where('chunk.knowledgeBaseId IN (:...ids)', { ids: kbIds })
                .select(['chunk.chunkText'])
                .getMany();

            return chunks.map(c => c.chunkText).filter(Boolean);
        } catch (err) {
            console.error('[VectorService] fetchAllChunks falló:', err?.message);
            return [];
        }
    }
}

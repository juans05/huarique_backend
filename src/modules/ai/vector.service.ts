import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import OpenAI from 'openai';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class VectorService {
    private openaiClient: OpenAI;

    constructor(
        private dataSource: DataSource,
        private configService: ConfigService
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
    async searchSimilarity(placeId: string, queryText: string, limit = 3): Promise<string[]> {
        let queryEmbedding: number[];
        try {
            queryEmbedding = await this.generateEmbedding(queryText);
        } catch (err) {
            console.error('[VectorService] Error generando embedding para búsqueda, usando fallback texto completo:', err?.message);
            return this.fetchAllChunks(placeId, limit);
        }

        // 2. Fetch all document chunks of the restaurant
        const chunks = await this.dataSource.query(
            `SELECT chunks.chunk_text, chunks.embedding
             FROM knowledge_base_chunks chunks
             INNER JOIN knowledge_bases kb ON chunks.knowledge_base_id = kb.id
             WHERE kb.place_id = $1`,
            [placeId]
        );

        if (chunks.length === 0) return [];

        // 3. Compute cosine similarity in memory
        const cosineSimilarity = (vecA: number[], vecB: number[]): number => {
            let dotProduct = 0.0;
            let normA = 0.0;
            let normB = 0.0;
            for (let i = 0; i < vecA.length; i++) {
                dotProduct += vecA[i] * vecB[i];
                normA += vecA[i] * vecA[i];
                normB += vecB[i] * vecB[i];
            }
            if (normA === 0.0 || normB === 0.0) return 0.0;
            return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
        };

        // 4. Score all chunks — those with empty/malformed embedding get score 0
        const rankedChunks = chunks.map((c: any) => {
            try {
                const chunkEmbedding = JSON.parse(c.embedding);
                if (!Array.isArray(chunkEmbedding) || chunkEmbedding.length === 0) {
                    return { text: c.chunk_text, score: 0 };
                }
                const score = cosineSimilarity(queryEmbedding, chunkEmbedding);
                return { text: c.chunk_text, score };
            } catch (e) {
                return { text: c.chunk_text, score: 0 };
            }
        });

        // 5. Sort descending and return top matches
        rankedChunks.sort((a, b) => b.score - a.score);

        // 6. If no chunk scored > 0, return all as fallback
        const top = rankedChunks.filter(c => c.score > 0).slice(0, limit).map(c => c.text);
        if (top.length > 0) return top;

        return this.fetchAllChunks(placeId, limit);
    }

    // Fallback: return chunks as plain text without similarity ranking
    private async fetchAllChunks(placeId: string, limit: number): Promise<string[]> {
        try {
            const chunks = await this.dataSource.query(
                `SELECT chunks.chunk_text
                 FROM knowledge_base_chunks chunks
                 INNER JOIN knowledge_bases kb ON chunks.knowledge_base_id = kb.id
                 WHERE kb.place_id = $1
                 ORDER BY kb.created_at ASC, chunks.id ASC
                 LIMIT $2`,
                [placeId, limit]
            );
            return chunks.map(c => c.chunk_text).filter(Boolean);
        } catch (err) {
            console.error('[VectorService] Fallback fetchAllChunks falló:', err?.message);
            return [];
        }
    }
}

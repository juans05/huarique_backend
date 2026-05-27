import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { KnowledgeBase } from './knowledge-base.entity';

@Entity('knowledge_base_chunks')
export class KnowledgeBaseChunk {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'knowledge_base_id' })
    knowledgeBaseId: string;

    @ManyToOne(() => KnowledgeBase, (kb) => kb.chunks, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'knowledge_base_id' })
    knowledgeBase: KnowledgeBase;

    @Column({ type: 'text', name: 'chunk_text' })
    chunkText: string;

    // TypeORM column mapped to pgvector custom type
    @Column({ type: 'text', name: 'embedding' })
    embedding: string;
}

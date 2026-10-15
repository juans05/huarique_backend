import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export type ReviewReplyOrigin = 'sugerencia' | 'auto' | 'lote';
export type ReviewReplyStatus = 'sugerida' | 'programada' | 'publicada' | 'cancelada' | 'sin_cupo' | 'error';

/** Cola de respuestas automáticas a reseñas de Google y registro del uso de IA (cupo mensual). */
@Entity('review_replies')
@Index(['placeId', 'createdAt'])
export class ReviewReply {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'place_id', type: 'uuid' })
    placeId: string;

    @Column({ name: 'review_name', type: 'varchar', length: 300, nullable: true })
    reviewName: string | null;

    @Column({ type: 'int' })
    stars: number;

    @Column({ type: 'varchar', length: 20 })
    origin: ReviewReplyOrigin;

    @Column({ type: 'varchar', length: 20 })
    status: ReviewReplyStatus;

    @Column({ name: 'ai_generated', default: false })
    aiGenerated: boolean;

    @Column({ name: 'reply_text', type: 'text', nullable: true })
    replyText: string | null;

    @Column({ name: 'scheduled_at', type: 'timestamptz', nullable: true })
    scheduledAt: Date | null;

    @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
    publishedAt: Date | null;

    @Column({ type: 'int', default: 0 })
    attempts: number;

    @Column({ type: 'text', nullable: true })
    error: string | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;
}

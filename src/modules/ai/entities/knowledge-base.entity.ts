import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany, CreateDateColumn } from 'typeorm';
import { Place } from '../../places/entities/place.entity';
import { KnowledgeBaseChunk } from './knowledge-base-chunk.entity';

@Entity('knowledge_bases')
export class KnowledgeBase {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'place_id' })
    placeId: string;

    @ManyToOne(() => Place, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'place_id' })
    place: Place;

    @Column({ name: 'file_name' })
    fileName: string;

    @Column({ name: 'file_url' })
    fileUrl: string;

    @OneToMany(() => KnowledgeBaseChunk, (chunk) => chunk.knowledgeBase)
    chunks: KnowledgeBaseChunk[];

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}

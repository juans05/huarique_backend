import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, Index } from 'typeorm';
import { RestaurantDocument } from './restaurant-document.entity';

@Entity('document_embeddings')
@Index(['userId', 'documentId'])
export class DocumentEmbedding {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => RestaurantDocument, { onDelete: 'CASCADE' })
  document: RestaurantDocument;

  @Column()
  documentId: string;

  @Column('text')
  chunk: string;

  @Column('float', { array: true })
  embedding: number[];

  @Column()
  chunkIndex: number;

  @CreateDateColumn()
  createdAt: Date;
}

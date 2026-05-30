import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Place } from '../../places/entities/place.entity';

@Entity('place_bot_configs')
export class PlaceBotConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'place_id', unique: true })
  placeId: string;

  @ManyToOne(() => Place, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'place_id' })
  place: Place;

  @Column('text', { nullable: true, name: 'system_prompt' })
  systemPrompt: string;

  @Column({ default: 'professional' })
  tone: 'professional' | 'casual' | 'friendly';

  @Column({ default: true, name: 'is_active' })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

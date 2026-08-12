import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Place } from '../../places/entities/place.entity';

@Entity('bot_menu_options')
export class BotMenuOption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'place_id' })
  placeId: string;

  @ManyToOne(() => Place, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'place_id' })
  place: Place;

  @Column({ name: 'display_order', type: 'int' })
  displayOrder: number;

  @Column()
  label: string;

  @Column({ name: 'action_type' })
  actionType: 'file' | 'text' | 'human';

  @Column({ type: 'text', nullable: true, name: 'action_value' })
  actionValue: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

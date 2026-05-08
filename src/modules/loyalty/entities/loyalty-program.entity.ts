import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('loyalty_programs')
export class LoyaltyProgram {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'place_id', unique: true })
  placeId: string;

  @Column({ type: 'enum', enum: ['stamps', 'points'], default: 'stamps' })
  type: 'stamps' | 'points';

  @Column({ name: 'stamps_to_reward', type: 'int', default: 10 })
  stampsToReward: number;

  @Column({ name: 'points_per_visit', type: 'int', default: 10 })
  pointsPerVisit: number;

  @Column({ name: 'reward_title', nullable: true })
  rewardTitle: string;

  @Column({ name: 'reward_description', type: 'text', nullable: true })
  rewardDescription: string;

  @Column({ name: 'welcome_message', type: 'text', nullable: true })
  welcomeMessage: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

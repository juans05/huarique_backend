import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('loyalty_transactions')
export class LoyaltyTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'loyalty_card_id' })
  loyaltyCardId: string;

  @Column({ name: 'place_id' })
  placeId: string;

  @Column({ type: 'enum', enum: ['earn', 'redeem'], default: 'earn' })
  type: 'earn' | 'redeem';

  @Column({ type: 'int', default: 0 })
  stamps: number;

  @Column({ type: 'int', default: 0 })
  points: number;

  @Column({ type: 'text', nullable: true })
  description: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

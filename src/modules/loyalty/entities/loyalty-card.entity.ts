import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('loyalty_cards')
@Index(['placeId', 'customerPhone'], { unique: true })
export class LoyaltyCard {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'place_id' })
  placeId: string;

  @Column({ name: 'customer_phone' })
  customerPhone: string;

  @Column({ name: 'customer_name', nullable: true })
  customerName: string;

  @Column({ type: 'int', default: 0 })
  stamps: number;

  @Column({ type: 'int', default: 0 })
  points: number;

  @Column({ name: 'total_visits', type: 'int', default: 0 })
  totalVisits: number;

  @Column({ name: 'total_redeemed', type: 'int', default: 0 })
  totalRedeemed: number;

  @Column({
    type: 'enum',
    enum: ['BRONCE', 'PLATA', 'ORO', 'VIP'],
    default: 'BRONCE',
  })
  level: 'BRONCE' | 'PLATA' | 'ORO' | 'VIP';

  @Column({ name: 'last_visit_at', type: 'timestamp', nullable: true })
  lastVisitAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

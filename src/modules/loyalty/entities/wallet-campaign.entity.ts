import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('wallet_campaigns')
export class WalletCampaign {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'place_id' })
  @Index()
  placeId: string;

  @Column()
  header: string;

  @Column()
  body: string;

  @Column({ name: 'total_queued', type: 'int', default: 0 })
  totalQueued: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

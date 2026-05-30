import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('tenant_plazbot_configs')
export class TenantPlazbotConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @Column()
  userId: string;

  @Column()
  plazBotApiKey: string;

  @Column()
  plazBotWorkspaceId: string;

  @Column()
  agentId: string;

  @Column({ nullable: true })
  placeId: string;

  @Column({ nullable: true })
  plazBotContactGroupId: string;

  @Column('text', { nullable: true })
  systemPrompt: string;

  @Column({ default: 'professional' })
  tone: string;

  @Column({ nullable: true })
  reservationTagId: string;

  @Column({ nullable: true })
  fallbackTemplateId: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  connectedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

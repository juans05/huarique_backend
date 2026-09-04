import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { User } from '../../users/entities/user.entity';

// Señal de demanda por un restaurante que TODAVÍA NO está en Wuarikes — distinta
// de "quiero ir" (que es sobre un lugar que ya existe en la plataforma). Se
// alimenta directo al panel de oportunidades comerciales.
@Entity('wuarikes_here_requests')
export class WuarikesHereRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'requested_by_user_id' })
  requestedByUserId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requested_by_user_id' })
  requestedBy: User;

  @Column({ name: 'restaurant_name' })
  restaurantName: string;

  @Column({ nullable: true })
  address: string | null;

  @Column({ nullable: true })
  @Index()
  district: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({
    type: 'enum',
    enum: ['nuevo', 'contactado', 'reunion', 'negociacion', 'afiliado', 'no_interesado'],
    default: 'nuevo',
  })
  @Index()
  status: 'nuevo' | 'contactado' | 'reunion' | 'negociacion' | 'afiliado' | 'no_interesado';

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

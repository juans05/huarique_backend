import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany, CreateDateColumn } from 'typeorm';
import { Place } from '../../places/entities/place.entity';
import { Message } from './message.entity';

export type ConversationStatus = 'abierto' | 'pendiente' | 'cerrado';

@Entity('conversations')
export class Conversation {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'place_id' })
    placeId: string;

    @ManyToOne(() => Place, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'place_id' })
    place: Place;

    @Column({ name: 'whatsapp_number_id', nullable: true })
    whatsappNumberId: string | null;

    @Column({ name: 'customer_phone' })
    customerPhone: string;

    @Column({ name: 'customer_name', nullable: true })
    customerName: string;

    @Column({ default: 'bot' })
    mode: 'bot' | 'human';

    @Column({ default: 'abierto' })
    status: ConversationStatus;

    @Column({ name: 'assigned_to_user_id', nullable: true })
    assignedToUserId: string | null;

    @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
    closedAt: Date | null;

    @OneToMany(() => Message, (message) => message.conversation)
    messages: Message[];

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}

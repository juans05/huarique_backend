import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany, CreateDateColumn } from 'typeorm';
import { Place } from '../../places/entities/place.entity';
import { Message } from './message.entity';

@Entity('conversations')
export class Conversation {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'place_id' })
    placeId: string;

    @ManyToOne(() => Place, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'place_id' })
    place: Place;

    @Column({ name: 'customer_phone' })
    customerPhone: string;

    @Column({ name: 'customer_name', nullable: true })
    customerName: string;

    @Column({ default: 'bot' })
    mode: 'bot' | 'human';

    @OneToMany(() => Message, (message) => message.conversation)
    messages: Message[];

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}

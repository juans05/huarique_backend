import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Conversation } from './conversation.entity';

@Entity('messages')
export class Message {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'conversation_id' })
    conversationId: string;

    @ManyToOne(() => Conversation, (conv) => conv.messages, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'conversation_id' })
    conversation: Conversation;

    @Column({ type: 'enum', enum: ['INCOMING', 'OUTGOING'], name: 'message_type' })
    messageType: 'INCOMING' | 'OUTGOING';

    @Column({ type: 'text', name: 'message_body' })
    messageBody: string;

    @Column({ name: 'is_from_ai', default: false })
    isFromAi: boolean;

    @Column({ name: 'whatsapp_message_id', nullable: true })
    whatsappMessageId: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}

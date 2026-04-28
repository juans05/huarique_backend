import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { Place } from '../../places/entities/place.entity';

@Entity('social_bot_rules')
export class SocialBotRule {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'place_id' })
    placeId: string;

    @ManyToOne(() => Place)
    @JoinColumn({ name: 'place_id' })
    place: Place;

    @Column({ name: 'reply_to_questions', default: true })
    replyToQuestions: boolean;

    @Column({ name: 'reply_to_compliments', default: true })
    replyToCompliments: boolean;

    @Column({ name: 'redirect_complaints', default: true })
    redirectComplaints: boolean;

    @Column({ name: 'reveal_prices', default: false })
    revealPrices: boolean;

    @Column({ default: 'friendly' })
    personality: 'friendly' | 'formal' | 'casual';

    @Column({ name: 'custom_instructions', type: 'text', nullable: true })
    customInstructions: string;

    @Column({ name: 'is_active', default: true })
    isActive: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}

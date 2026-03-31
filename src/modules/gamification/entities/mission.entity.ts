import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
} from 'typeorm';

@Entity('missions')
export class Mission {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({
        type: 'enum',
        enum: ['daily', 'weekly', 'special'],
    })
    type: string;

    @Column({ length: 100 })
    name: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({ type: 'jsonb' })
    criteria: {
        type: string;
        target: number;
        timeframe?: string;
        minRarity?: string;
        before?: string;
        after?: string;
    };

    @Column({ name: 'reward_xp', type: 'int' })
    rewardXp: number;

    @Column({ name: 'icon_url', nullable: true })
    iconUrl: string;

    @Column({ name: 'is_active', default: true })
    isActive: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}

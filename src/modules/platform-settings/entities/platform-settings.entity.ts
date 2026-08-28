import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

export const PLATFORM_SETTINGS_ID = '00000000-0000-0000-0000-000000000001';

@Entity('platform_settings')
export class PlatformSettings {
    @PrimaryColumn('uuid')
    id: string;

    @Column({ name: 'contact_email', nullable: true })
    contactEmail: string | null;

    @Column({ name: 'contact_phone', nullable: true })
    contactPhone: string | null;

    @Column({ name: 'contact_address', nullable: true })
    contactAddress: string | null;

    @Column({ name: 'social_instagram', nullable: true })
    socialInstagram: string | null;

    @Column({ name: 'social_facebook', nullable: true })
    socialFacebook: string | null;

    @Column({ name: 'social_tiktok', nullable: true })
    socialTiktok: string | null;

    @Column({ name: 'social_x', nullable: true })
    socialX: string | null;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}

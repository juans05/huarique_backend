import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Celular con la app del barbero: su token de Expo para recibir push. */
@Entity('push_devices')
export class PushDevice {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'user_id', type: 'uuid' }) userId: string;
    @Column({ length: 200, unique: true }) token: string;
    @Column({ length: 10, default: 'android' }) platform: string;
    @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
    @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}

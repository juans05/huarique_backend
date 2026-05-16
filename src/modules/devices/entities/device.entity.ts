import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum DeviceType {
  NFC = 'NFC',
  TABLET = 'TABLET',
  QR = 'QR',
}

export enum DeviceAction {
  REPUTATION = 'reputation',
  RAFFLE = 'raffle',
  MENU = 'menu',
}

export enum DeviceStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  DAMAGED = 'damaged',
}

@Entity('devices')
@Index(['placeId'])
export class Device {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'place_id' })
  placeId: string;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: DeviceType, default: DeviceType.NFC })
  deviceType: DeviceType;

  @Column({ type: 'enum', enum: DeviceAction, default: DeviceAction.REPUTATION })
  action: DeviceAction;

  @Column({ type: 'enum', enum: DeviceStatus, default: DeviceStatus.ACTIVE })
  status: DeviceStatus;

  @Column({ name: 'serial_number', nullable: true })
  serialNumber?: string;

  @Column({ name: 'last_sync_at', type: 'timestamp', nullable: true })
  lastSyncAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

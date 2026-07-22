import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum TapType {
  GENERICO = 'generico',
  PERSONALIZADO = 'personalizado',
}

export enum DeviceRequestStatus {
  PENDING = 'pending',
  FULFILLED = 'fulfilled',
  REJECTED = 'rejected',
}

export const TAP_UNIT_PRICE: Record<TapType, number> = {
  [TapType.GENERICO]: 20,
  [TapType.PERSONALIZADO]: 40,
};

export const TAP_MIN_QUANTITY = 5;

@Entity('device_requests')
@Index(['placeId'])
export class DeviceRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'place_id' })
  placeId: string;

  @Column({ name: 'tap_type', type: 'enum', enum: TapType })
  tapType: TapType;

  @Column()
  quantity: number;

  @Column({ name: 'unit_price', type: 'decimal', precision: 10, scale: 2 })
  unitPrice: number;

  @Column({ name: 'total_price', type: 'decimal', precision: 10, scale: 2 })
  totalPrice: number;

  @Column({ type: 'enum', enum: DeviceRequestStatus, default: DeviceRequestStatus.PENDING })
  status: DeviceRequestStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

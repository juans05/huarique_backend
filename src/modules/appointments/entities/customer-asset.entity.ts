import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type AssetKind = 'PET' | 'VEHICLE';
/** Mascota: especie, raza, nacimiento, sexo, peso, vacunas. Vehículo: marca, modelo, año, color, kilometraje. */
export type AssetData = Record<string, string | number | null>;

/** Ficha de lo que se atiende de un cliente: su mascota o su vehículo (según el rubro). `name` = nombre de la mascota o placa. */
@Entity('customer_assets')
export class CustomerAsset {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'place_id' }) placeId: string;
    @Column({ name: 'customer_phone' }) customerPhone: string;
    @Column({ name: 'customer_name', type: 'varchar', nullable: true }) customerName: string | null;
    @Column() kind: AssetKind;
    @Column() name: string;
    @Column({ type: 'jsonb', default: () => "'{}'" }) data: AssetData;
    @Column({ type: 'varchar', nullable: true }) notes: string | null;
    @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}

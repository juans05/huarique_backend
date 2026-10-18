import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Place } from './place.entity';

@Entity('categories')
export class Category {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    name: string;

    @Column({ unique: true })
    slug: string;

    @Column({ nullable: true })
    icon: string;

    /** Rubro al que pertenece la categoría (ver business-types.ts). */
    @Column({ type: 'varchar', nullable: true })
    vertical: string | null;

    @OneToMany(() => Place, (place) => place.category)
    places: Place[];
}

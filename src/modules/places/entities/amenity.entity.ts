import { Entity, PrimaryGeneratedColumn, Column, ManyToMany } from 'typeorm';
import { Place } from './place.entity';

@Entity('amenities')
export class Amenity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    name: string;

    @Column({ name: 'slug', unique: true })
    slug: string;

    @Column({ name: 'icon_url', nullable: true })
    iconUrl: string;

    @ManyToMany(() => Place, (place) => place.amenities)
    places: Place[];
}

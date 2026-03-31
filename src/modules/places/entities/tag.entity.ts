import { Entity, PrimaryGeneratedColumn, Column, ManyToMany } from 'typeorm';
import { Place } from './place.entity';

@Entity('tags')
export class Tag {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    name: string;

    @Column({ name: 'slug', unique: true })
    slug: string;

    @ManyToMany(() => Place, (place) => place.tags)
    places: Place[];
}

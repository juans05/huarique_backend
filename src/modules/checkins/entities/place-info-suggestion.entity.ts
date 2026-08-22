import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
    Unique,
} from 'typeorm';
import { Place } from '../../places/entities/place.entity';
import { User } from '../../users/entities/user.entity';

export type PlaceInfoField = 'phone' | 'address' | 'menu' | 'hours';

// Un usuario vota una sola vez por campo/local; revotar actualiza su fila
// (ver UNIQUE en la migración). Cuando 3 votos coinciden en el mismo valor
// normalizado, CheckinsService.submitInfoSuggestion() aplica el cambio.
@Entity('place_info_suggestions')
@Unique(['placeId', 'field', 'userId'])
export class PlaceInfoSuggestion {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'place_id' })
    placeId: string;

    @ManyToOne(() => Place)
    @JoinColumn({ name: 'place_id' })
    place: Place;

    @Column({ type: 'varchar', length: 20 })
    field: PlaceInfoField;

    @Column({ name: 'suggested_value', type: 'text', nullable: true })
    suggestedValue: string | null;

    @Column({ name: 'user_id' })
    userId: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'user_id' })
    user: User;

    @Column({ default: false })
    applied: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}

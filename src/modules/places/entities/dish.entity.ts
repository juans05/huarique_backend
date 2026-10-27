import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { Place } from './place.entity';
import { MenuCategory } from './menu-category.entity';

@Entity('dishes')
export class Dish {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string;

    @Column({ type: 'text', nullable: true })
    description: string | null;

    @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
    price: number | null;

    @Column({ name: 'image_url', nullable: true })
    imageUrl: string | null;

    /** Galería del plato (carrusel). images[0] es la portada y se espeja en imageUrl. */
    @Column({ type: 'jsonb', nullable: true })
    images: string[] | null;

    @Column({ name: 'video_url', nullable: true })
    videoUrl: string | null;

    /** Catálogo común a todos los rubros: 'producto' (carta, tienda) o 'servicio' (corte, consulta, lavado). */
    @Column({ type: 'varchar', default: 'producto' })
    kind: 'producto' | 'servicio';

    /** Duración en minutos, solo para servicios (la usará el motor de reservas). */
    @Column({ name: 'duration_min', type: 'int', nullable: true })
    durationMin: number | null;

    /** Servicio de rutina: cada cuántos días suele volver el cliente (ej. corte cada 20). null = sin aviso. */
    @Column({ name: 'recall_days', type: 'int', nullable: true })
    recallDays: number | null;

    /** Cuántos días antes de que le toque se le avisa (null = 2). */
    @Column({ name: 'recall_notice_days', type: 'int', nullable: true })
    recallNoticeDays: number | null;

    @Column({ name: 'is_vegetarian', default: false })
    isVegetarian: boolean;

    @Column({ type: 'jsonb', nullable: true })
    allergens: string[] | null;

    @Column({ type: 'jsonb', nullable: true })
    ingredients: string[] | null;

    @Column({ name: 'is_available', default: true })
    isAvailable: boolean;

    @Column({ name: 'display_order', default: 0 })
    displayOrder: number;

    @ManyToOne(() => Place, (place) => place.dishes, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'place_id' })
    place: Place;

    @Column({ name: 'place_id' })
    placeId: string;

    @ManyToOne(() => MenuCategory, (cat) => cat.dishes, { onDelete: 'SET NULL', nullable: true })
    @JoinColumn({ name: 'category_id' })
    category: MenuCategory | null;

    @Column({ name: 'category_id', nullable: true })
    categoryId: string | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}

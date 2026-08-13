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

    @Column({ name: 'video_url', nullable: true })
    videoUrl: string | null;

    @Column({ name: 'is_vegetarian', default: false })
    isVegetarian: boolean;

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

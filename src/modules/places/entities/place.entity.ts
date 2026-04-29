import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn,
    OneToMany,
    Index,
    ManyToMany,
    JoinTable,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Checkin } from '../../checkins/entities/checkin.entity';
import { Tag } from './tag.entity';
import { Amenity } from './amenity.entity';
import { Ubigeo } from '../../ubigeo/entities/ubigeo.entity';
import { Category } from './category.entity';
import { Dish } from './dish.entity';
import { PlaceVideo } from './place-video.entity';


@Entity('places')
export class Place {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ nullable: true })
    name: string | null;

    @Column({ name: 'name_normalized', nullable: true })
    nameNormalized: string | null;

    @Column({ type: 'text', nullable: true })
    description: string | null;

    @ManyToOne(() => Category, (category) => category.places, { nullable: true })
    @JoinColumn({ name: 'category_id' })
    category: Category | null;

    @Column({ name: 'category_id', nullable: true })
    categoryId: string | null;

    @ManyToOne(() => Ubigeo, { nullable: true })
    @JoinColumn({ name: 'district_id' })
    district: Ubigeo | null;

    @Column({ name: 'district_id', nullable: true })
    districtId: string | null;

    @Column({ type: 'text', nullable: true })
    address: string | null;

    @Column({ type: 'decimal', nullable: true })
    @Index()
    latitude: number | null;

    @Column({ type: 'decimal', nullable: true })
    @Index()
    longitude: number | null;

    @Column({
        type: 'geography',
        spatialFeatureType: 'Point',
        srid: 4326,
        nullable: true
    })
    @Index({ spatial: true })
    location: any;

    @Column({ nullable: true })
    phone: string | null;

    @Column({ nullable: true })
    website: string | null;

    @Column({ name: 'cover_image_url', nullable: true })
    coverImageUrl: string | null;

    @Column({ default: 'active' })
    status: 'active' | 'inactive' | 'pending';

    @Column({ name: 'is_verified', default: false })
    isVerified: boolean;

    @Column({ name: 'verified_at', type: 'timestamp', nullable: true })
    verifiedAt: Date | null;

    @Column({
        type: 'enum',
        enum: ['COMÚN', 'RARO', 'ÉPICO', 'LEGENDARIO'],
        default: 'COMÚN',
        nullable: true
    })
    rarity: string | null;

    @Column({ name: 'rarity_score', type: 'int', default: 0 })
    rarityScore: number;

    @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
    rating: number;

    @Column({ name: 'total_reviews', type: 'int', default: 0 })
    totalReviews: number;

    @Column({ name: 'google_place_id', nullable: true })
    googlePlaceId: string | null;

    @Column({ unique: true, nullable: true })
    @Index()
    slug: string | null;

    @Column({ name: 'google_rating', type: 'decimal', precision: 3, scale: 2, nullable: true })
    googleRating: number | null;

    @Column({ name: 'claimed_by_user_id', nullable: true })
    claimedByUserId: string | null;

    @Column({ name: 'average_price', type: 'decimal', precision: 10, scale: 2, nullable: true })
    averagePrice: number | null;

    @Column({ name: 'price_min', type: 'decimal', precision: 10, scale: 2, nullable: true })
    priceMin: number | null;

    @Column({ name: 'price_max', type: 'decimal', precision: 10, scale: 2, nullable: true })
    priceMax: number | null;

    @Column({ name: 'open_hours_text', nullable: true })
    openHoursText: string | null;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: 'claimed_by_user_id' })
    claimedBy: User;

    @Column({ type: 'jsonb', nullable: true })
    metadata: any;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;

    @OneToMany(() => Checkin, (checkin) => checkin.place)
    checkins: Checkin[];

    @ManyToMany(() => Tag, (tag) => tag.places)
    @JoinTable({
        name: 'place_tags',
        joinColumn: { name: 'place_id', referencedColumnName: 'id' },
        inverseJoinColumn: { name: 'tag_id', referencedColumnName: 'id' },
    })
    tags: Tag[];

    @ManyToMany(() => Amenity, (amenity) => amenity.places)
    @JoinTable({
        name: 'place_amenities',
        joinColumn: { name: 'place_id', referencedColumnName: 'id' },
        inverseJoinColumn: { name: 'amenity_id', referencedColumnName: 'id' },
    })
    amenities: Amenity[];

    @Column({ default: 0 })
    views: number;

    @OneToMany(() => Dish, (dish) => dish.place)
    dishes: Dish[];

    @OneToMany(() => PlaceVideo, (video) => video.place)
    videos: PlaceVideo[];

    // Virtual fields (not in DB)

    totalCheckins?: number;
    uniqueVisitors?: number;
    distance?: number;
}

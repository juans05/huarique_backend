import { Expose, Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class CategoryDto {
    @Expose()
    id: string;

    @Expose()
    name: string;

    @Expose()
    slug: string;

    @Expose()
    icon: string | null;
}

class DistrictDto {
    @Expose()
    id: string;

    @Expose()
    department: string;

    @Expose()
    province: string;

    @Expose()
    district: string;

    @Expose()
    ubigeoCode: string;

    @Expose()
    latitude: string;

    @Expose()
    longitude: string;
}

class DishDto {
    @Expose()
    id: string;

    @Expose()
    name: string;

    @Expose()
    description: string | null;

    @Expose()
    price: number | null;

    @Expose()
    imageUrl: string | null;
}

export class PlaceResponseDto {
    @ApiProperty()
    @Expose()
    id: string;

    @ApiProperty()
    @Expose()
    name: string;

    @ApiPropertyOptional()
    @Expose()
    description: string | null;

    @ApiPropertyOptional({ description: 'Category object' })
    @Expose()
    @Type(() => CategoryDto)
    category: CategoryDto | null;

    @ApiPropertyOptional({ description: 'District object' })
    @Expose()
    @Type(() => DistrictDto)
    district: DistrictDto | null;

    @ApiPropertyOptional()
    @Expose()
    address: string | null;

    @ApiProperty()
    @Expose()
    latitude: number;

    @ApiProperty()
    @Expose()
    longitude: number;

    @ApiPropertyOptional()
    @Expose()
    phone: string | null;

    @ApiPropertyOptional()
    @Expose()
    website: string | null;

    @ApiPropertyOptional()
    @Expose()
    coverImageUrl: string | null;

    @ApiProperty()
    @Expose()
    status: string;

    @ApiProperty()
    @Expose()
    isVerified: boolean;

    @ApiPropertyOptional()
    @Expose()
    verifiedAt: Date | null;

    @ApiPropertyOptional()
    @Expose()
    rarity: string | null;

    @ApiProperty()
    @Expose()
    rarityScore: number;

    @ApiProperty()
    @Expose()
    rating: number;

    @ApiProperty()
    @Expose()
    totalReviews: number;

    @ApiPropertyOptional()
    @Expose()
    claimedByUserId: string | null;

    @ApiPropertyOptional()
    @Expose()
    googlePlaceId: string | null;

    @ApiPropertyOptional()
    @Expose()
    googleRating: number | null;

    @ApiPropertyOptional()
    @Expose()
    averagePrice: number | null;

    @ApiPropertyOptional()
    @Expose()
    priceMin: number | null;

    @ApiPropertyOptional()
    @Expose()
    priceMax: number | null;

    @ApiPropertyOptional()
    @Expose()
    openHoursText: string | null;

    @ApiProperty()
    @Expose()
    createdAt: Date;

    @ApiProperty()
    @Expose()
    updatedAt: Date;

    // Optional virtual fields
    @ApiPropertyOptional()
    @Expose()
    totalCheckins?: number;

    @ApiPropertyOptional()
    @Expose()
    uniqueVisitors?: number;

    @ApiPropertyOptional()
    @Expose()
    distance?: number;

    @ApiPropertyOptional({ type: [String] })
    @Expose()
    @Transform(({ obj }) => obj.tags?.map((tag: any) => tag.name) || [])
    tags?: string[];

    @ApiPropertyOptional({ type: [String] })
    @Expose()
    @Transform(({ obj }) => obj.amenities?.map((amenity: any) => amenity.name) || [])
    amenities?: string[];

    @ApiPropertyOptional({ type: [DishDto], isArray: true })
    @Expose()
    @Type(() => DishDto)
    dishes?: DishDto[];
}

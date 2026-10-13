import { IsString, IsNotEmpty, IsIn, IsInt, Min, Max, MaxLength } from 'class-validator';
import { HARDWARE_PRODUCTS, HardwareProductId } from '../subscriptions.service';

export class BuyHardwareDto {
    @IsString()
    @IsNotEmpty()
    token: string;

    @IsIn(HARDWARE_PRODUCTS.map((p) => p.id))
    productId: HardwareProductId;

    @IsInt()
    @Min(1)
    @Max(20)
    quantity: number;

    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    fullName: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(20)
    phone: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    address: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(60)
    district: string;
}

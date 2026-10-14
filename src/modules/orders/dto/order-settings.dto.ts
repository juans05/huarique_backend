import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateOrderSettingsDto {
    @IsOptional() @IsBoolean() ordersEnabled?: boolean;
    @IsOptional() @IsIn(['CUENTA_ABIERTA', 'PREPAGO']) tablePaymentMode?: 'CUENTA_ABIERTA' | 'PREPAGO';
    @IsOptional() @IsIn(['LOCAL', 'WUARIKES']) paymentDestination?: 'LOCAL' | 'WUARIKES';
    @IsOptional() @IsString() @MaxLength(120) culqiPublicKey?: string;
    @IsOptional() @IsString() @MaxLength(200) culqiSecretKey?: string;
    @IsOptional() @IsBoolean() pickupEnabled?: boolean;
    @IsOptional() @IsBoolean() deliveryEnabled?: boolean;
    @IsOptional() @IsInt() @Min(0) @Max(50000) deliveryFee?: number;
    @IsOptional() @IsString() @MaxLength(300) deliveryNote?: string;
    @IsOptional() @IsInt() @Min(1) @Max(180) prepTimeMin?: number;
    @IsOptional() @IsBoolean() pricesIncludeIgv?: boolean;
    @IsOptional() @IsBoolean() cashPaymentEnabled?: boolean;
}

export class AdminCommissionDto {
    @IsNumber() @Min(0) @Max(0.5) wuarikesCommissionPct: number;
}

export class TableDto {
    @IsString() @MaxLength(40) name: string;
    @IsOptional() @IsInt() @Min(1) @Max(40) capacity?: number;
}

export class UpdateTableDto {
    @IsOptional() @IsString() @MaxLength(40) name?: string;
    @IsOptional() @IsInt() @Min(1) @Max(40) capacity?: number;
    @IsOptional() @IsInt() @Min(0) displayOrder?: number;
    @IsOptional() @IsBoolean() active?: boolean;
}

import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

const SERIES = /^[A-Z0-9]{4}$/;
const SERIES_MSG = 'Cada serie tiene 4 caracteres (letras mayúsculas o números), por ejemplo B001';

export class ReceiptSeriesDto {
    @Matches(SERIES, { message: SERIES_MSG }) TICKET: string;
    @Matches(SERIES, { message: SERIES_MSG }) BOLETA: string;
    @Matches(SERIES, { message: SERIES_MSG }) FACTURA: string;
    @Matches(SERIES, { message: SERIES_MSG }) NOTA_CREDITO: string;
}

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
    @IsOptional() @ValidateNested() @Type(() => ReceiptSeriesDto) receiptSeries?: ReceiptSeriesDto;
    @IsOptional() @IsBoolean() tableOnlinePaymentEnabled?: boolean;
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

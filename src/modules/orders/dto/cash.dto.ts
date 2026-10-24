import { Type } from 'class-transformer';
import { ArrayMaxSize, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

export class OpenCashDto {
    /** Céntimos. */
    @IsInt() @Min(0) @Max(10_000_000) openingAmount: number;
}

export class CloseCashDto {
    /** Efectivo contado al cerrar, en céntimos (opcional: arqueo). */
    @IsOptional() @IsInt() @Min(0) @Max(100_000_000) countedCash?: number;
}

export class PrecuentaDto {
    @IsIn(['TICKET', 'BOLETA', 'FACTURA']) docType: 'TICKET' | 'BOLETA' | 'FACTURA';
    @IsOptional() @IsIn(['DNI', 'RUC', 'CE']) customerDocType?: string;
    @IsOptional() @IsString() @MaxLength(15) customerDocNumber?: string;
    @IsOptional() @IsString() @MaxLength(200) customerName?: string;
    @IsOptional() @IsString() @MaxLength(300) customerAddress?: string;
}

export class ChargeDto extends PrecuentaDto {
    @IsUUID() tabId: string;
    @IsIn(['EFECTIVO', 'TARJETA', 'YAPE_PLIN']) method: 'EFECTIVO' | 'TARJETA' | 'YAPE_PLIN';
}

/** Línea de venta: un ítem del catálogo (dishId) o un "otro ítem" con nombre y precio. */
export class SaleLineDto {
    @IsOptional() @IsUUID() dishId?: string;
    @IsOptional() @IsString() @MinLength(1) @MaxLength(150) name?: string;
    /** Céntimos; solo para "otro ítem" (los del catálogo usan su precio). */
    @IsOptional() @IsInt() @Min(0) @Max(10_000_000) unitPrice?: number;
    @IsInt() @Min(1) @Max(999) quantity: number;
}

/** Venta directa en mostrador o cobro de una cita (la cita agrega su servicio sola). */
export class SaleDto extends PrecuentaDto {
    @IsIn(['EFECTIVO', 'TARJETA', 'YAPE_PLIN']) method: 'EFECTIVO' | 'TARJETA' | 'YAPE_PLIN';
    @IsOptional() @ValidateNested({ each: true }) @Type(() => SaleLineDto) @ArrayMaxSize(60) items?: SaleLineDto[];
    @IsOptional() @IsUUID() appointmentId?: string;
}

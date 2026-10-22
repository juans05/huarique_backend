import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

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

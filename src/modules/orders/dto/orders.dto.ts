import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Matches, Min, ValidateNested } from 'class-validator';

export class CartLineDto {
    @IsUUID() dishId: string;
    @IsInt() @Min(1) @Max(50) quantity: number;
    @IsOptional() @IsString() @MaxLength(200) note?: string;
}

export class CreateTableOrderDto {
    @IsString() @MaxLength(64) qrToken: string;
    @IsString() @Matches(/^\d{4}$/, { message: 'El PIN tiene 4 dígitos' }) pin: string;
    @ValidateNested({ each: true }) @Type(() => CartLineDto) @ArrayMinSize(1) @ArrayMaxSize(40) items: CartLineDto[];
    @IsOptional() @IsString() @MaxLength(120) customerName?: string;
    @IsOptional() @IsString() @MaxLength(30) customerPhone?: string;
    @IsOptional() @IsString() @MaxLength(300) notes?: string;
}

export class ChangeStatusDto {
    @IsIn(['EN_PREPARACION', 'LISTO', 'ENTREGADO', 'CANCELADO']) status: 'EN_PREPARACION' | 'LISTO' | 'ENTREGADO' | 'CANCELADO';
    @IsOptional() @IsString() @MaxLength(200) reason?: string;
}

export class ManualPaymentDto {
    @IsOptional() @IsUUID() tabId?: string;
    @IsOptional() @IsUUID() orderId?: string;
    @IsIn(['EFECTIVO', 'POS']) method: 'EFECTIVO' | 'POS';
}

export class PaymentIntentDto {
    @IsOptional() @IsString() @MaxLength(64) orderToken?: string;
    @IsOptional() @IsString() @MaxLength(64) tabToken?: string;
    @IsEmail({}, { message: 'Ingresa un correo válido' }) email: string;
    @IsOptional() @IsString() @MaxLength(120) name?: string;
    @IsOptional() @IsString() @MaxLength(30) phone?: string;
}

export class PaymentTokenDto {
    @IsString() @MaxLength(120) token: string;
}

export class VerifyTablePinDto {
    @IsString() @Matches(/^\d{4}$/, { message: 'El PIN tiene 4 dígitos' }) pin: string;
}

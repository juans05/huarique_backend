import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export class DayHoursDto {
    @IsIn(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) day: string;
    @Matches(TIME, { message: 'Hora en formato HH:MM' }) open: string;
    @Matches(TIME, { message: 'Hora en formato HH:MM' }) close: string;
}

export class ProfessionalDto {
    @IsString() @MinLength(1) @MaxLength(80) name: string;
    @IsOptional() @IsString() @MaxLength(500) photoUrl?: string | null;
    @IsOptional() @IsString() @MaxLength(40) station?: string | null;
    @IsOptional() @IsArray() @IsUUID('all', { each: true }) @ArrayMaxSize(200) serviceIds?: string[];
    /** null = usa el horario del local. */
    @IsOptional() @ValidateNested({ each: true }) @Type(() => DayHoursDto) @ArrayMaxSize(7) schedule?: DayHoursDto[] | null;
    @IsOptional() @IsArray() @Matches(DATE, { each: true }) @ArrayMaxSize(366) daysOff?: string[];
    @IsOptional() @IsUUID() teamUserId?: string | null;
    @IsOptional() @IsBoolean() active?: boolean;
    @IsOptional() @IsInt() @Min(0) displayOrder?: number;
}

export class AvailabilityQueryDto {
    @IsUUID() serviceId: string;
    @Matches(DATE) date: string;
    @IsOptional() @IsUUID() professionalId?: string;
}

export class BookDto {
    @IsUUID() serviceId: string;
    /** Sin profesional = cualquiera libre a esa hora. */
    @IsOptional() @IsUUID() professionalId?: string | null;
    @Matches(DATE, { message: 'Fecha en formato AAAA-MM-DD' }) date: string;
    @Matches(TIME, { message: 'Hora en formato HH:MM' }) time: string;
    @IsString() @MinLength(2) @MaxLength(120) customerName: string;
    @IsOptional() @IsString() @MaxLength(30) customerPhone?: string;
    @IsOptional() @IsString() @MaxLength(300) notes?: string;
}

/** Reserva desde el link público: el teléfono es obligatorio (para confirmar o avisar). */
export class PublicBookDto extends BookDto {
    @IsString() @Matches(/^\+?[\d\s-]{7,20}$/, { message: 'Ingresa un teléfono válido' }) declare customerPhone: string;
}

export class UpdateAppointmentDto {
    @IsOptional() @IsIn(['RESERVADA', 'ATENDIDA', 'NO_ASISTIO', 'CANCELADA']) status?: 'RESERVADA' | 'ATENDIDA' | 'NO_ASISTIO' | 'CANCELADA';
    @IsOptional() @Matches(DATE) date?: string;
    @IsOptional() @Matches(TIME) time?: string;
    @IsOptional() @IsUUID() professionalId?: string;
}

export class DayQueryDto {
    @Matches(DATE) date: string;
}

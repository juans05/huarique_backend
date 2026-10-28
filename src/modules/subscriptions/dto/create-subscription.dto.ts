import { IsString, IsNotEmpty, IsIn, Equals, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateSubscriptionDto {
    @IsString()
    @IsNotEmpty()
    token: string;

    @IsIn(['reputacion', 'fidelizacion', 'ia_total', 'barbero'])
    tier: 'reputacion' | 'fidelizacion' | 'ia_total' | 'barbero';

    // Datos del titular que Culqi exige para crear el cliente de la suscripción.
    @IsString()
    @IsNotEmpty({ message: 'Escribe tu nombre' })
    @MaxLength(50)
    firstName: string;

    @IsString()
    @IsNotEmpty({ message: 'Escribe tu apellido' })
    @MaxLength(50)
    lastName: string;

    @Matches(/^\D*(\d\D*){9,}$/, { message: 'El celular debe tener 9 dígitos' })
    phone: string;

    @IsString()
    @MinLength(5, { message: 'Escribe tu dirección' })
    @MaxLength(100)
    address: string;

    @IsString()
    @IsNotEmpty({ message: 'Escribe tu ciudad' })
    @MaxLength(30)
    city: string;

    @Equals(true, { message: 'Debes aceptar los términos y condiciones' })
    acceptedTerms: boolean;
}

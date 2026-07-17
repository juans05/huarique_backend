import { IsString, IsNotEmpty, IsIn } from 'class-validator';

export class CreateSubscriptionDto {
    @IsString()
    @IsNotEmpty()
    token: string;

    @IsIn(['reputacion', 'fidelizacion', 'ia_total'])
    tier: 'reputacion' | 'fidelizacion' | 'ia_total';
}

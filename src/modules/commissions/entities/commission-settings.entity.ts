import { Column, Entity, PrimaryColumn } from 'typeorm';

// numeric de Postgres llega como string: se convierte a number al leer.
export const decimalToNumber = { to: (v: number) => v, from: (v: string | null) => (v === null ? null : Number(v)) };

@Entity('commission_settings')
export class CommissionSettings {
    @PrimaryColumn({ type: 'int' })
    id: number;

    @Column({ name: 'first_month_rate', type: 'numeric', precision: 5, scale: 4, transformer: decimalToNumber })
    firstMonthRate: number;

    @Column({ name: 'recurring_rate', type: 'numeric', precision: 5, scale: 4, transformer: decimalToNumber })
    recurringRate: number;

    @Column({ name: 'recurring_months', type: 'int' })
    recurringMonths: number;

    @Column({ name: 'clawback_days', type: 'int' })
    clawbackDays: number;

    @Column({ name: 'updated_at', type: 'timestamptz' })
    updatedAt: Date;

    @Column({ name: 'updated_by_user_id', type: 'uuid', nullable: true })
    updatedByUserId: string | null;
}

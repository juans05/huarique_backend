const LIMA_OFFSET_MS = 5 * 3600_000; // UTC−5, Perú no usa horario de verano

export function limaPeriod(date: Date): string {
    const lima = new Date(date.getTime() - LIMA_OFFSET_MS);
    return `${lima.getUTCFullYear()}-${String(lima.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function limaMonthRange(period: string): { start: Date; end: Date } {
    const [year, month] = period.split('-').map(Number);
    return {
        start: new Date(Date.UTC(year, month - 1, 1) + LIMA_OFFSET_MS),
        end: new Date(Date.UTC(year, month, 1) + LIMA_OFFSET_MS),
    };
}

import { computeWeeklyStats, hasActivity } from './weekly-stats';

const manager = (rowsByTable: Record<string, any>) => ({
    query: jest.fn(async (sql: string) => {
        if (sql.includes('AVG(rating)')) return [{ average: rowsByTable.average }];
        const table = Object.keys(rowsByTable).find((t) => sql.includes(`wuarike_db.${t}`));
        return [rowsByTable[table!]];
    }),
});

describe('computeWeeklyStats', () => {
    it('devuelve los conteos reales de esta semana y la anterior, y el promedio redondeado', async () => {
        const m = manager({
            place_scans: { current: 40, previous: 25 },
            public_feedback: { current: 6, previous: 4 },
            checkins: { current: 3, previous: 0 },
            average: 4.3333,
        });
        const stats = await computeWeeklyStats(m as any, 'p1', new Date('2026-10-19T13:00:00Z'));
        expect(stats).toEqual({
            scans: { current: 40, previous: 25 },
            opinions: { current: 6, previous: 4 },
            checkins: { current: 3, previous: 0 },
            averageRating: 4.3,
        });
        expect(hasActivity(stats)).toBe(true);
    });

    it('usa siempre el esquema wuarike_db y excluye check-ins sospechosos', async () => {
        const m = manager({ place_scans: { current: 0, previous: 0 }, public_feedback: { current: 0, previous: 0 }, checkins: { current: 0, previous: 0 }, average: null });
        const stats = await computeWeeklyStats(m as any, 'p1');
        const sqls = m.query.mock.calls.map((c: any[]) => c[0] as string);
        expect(sqls.every((s) => s.includes('wuarike_db.'))).toBe(true);
        expect(sqls.find((s) => s.includes('wuarike_db.checkins'))).toContain('is_suspicious = false');
        expect(stats.averageRating).toBeNull();
        expect(hasActivity(stats)).toBe(false);
    });
});

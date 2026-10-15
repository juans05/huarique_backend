import { EntityManager } from 'typeorm';

export interface WeeklyCount { current: number; previous: number }

export interface WeeklyStats {
    scans: WeeklyCount;
    opinions: WeeklyCount;
    averageRating: number | null;
    checkins: WeeklyCount;
}

const DAY_MS = 24 * 3600_000;

/** Actividad real del local en los últimos 7 días y en los 7 anteriores (nada simulado). */
export async function computeWeeklyStats(manager: EntityManager, placeId: string, now = new Date()): Promise<WeeklyStats> {
    const weekStart = new Date(now.getTime() - 7 * DAY_MS);
    const previousStart = new Date(now.getTime() - 14 * DAY_MS);
    const params = [placeId, previousStart, weekStart, now];

    const countBy = async (table: string, extra = '') => {
        const rows = await manager.query(
            `SELECT
               COUNT(*) FILTER (WHERE created_at >= $3 AND created_at < $4)::int AS current,
               COUNT(*) FILTER (WHERE created_at >= $2 AND created_at < $3)::int AS previous
             FROM wuarike_db.${table}
             WHERE place_id::text = $1 AND created_at >= $2 ${extra}`,
            params,
        );
        return { current: Number(rows[0]?.current ?? 0), previous: Number(rows[0]?.previous ?? 0) };
    };

    const [scans, opinions, checkins, ratingRows] = await Promise.all([
        countBy('place_scans'),
        countBy('public_feedback'),
        countBy('checkins', 'AND is_suspicious = false'),
        manager.query(
            `SELECT AVG(rating)::float AS average FROM wuarike_db.public_feedback
             WHERE place_id::text = $1 AND created_at >= $2 AND created_at < $3`,
            [placeId, weekStart, now],
        ),
    ]);
    const average = ratingRows[0]?.average;
    return { scans, opinions, checkins, averageRating: average === null || average === undefined ? null : Math.round(Number(average) * 10) / 10 };
}

export function hasActivity(stats: WeeklyStats): boolean {
    return stats.scans.current + stats.opinions.current + stats.checkins.current > 0;
}

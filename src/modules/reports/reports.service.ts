import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation } from '../whatsapp/entities/conversation.entity';

type Bucket = 'attended' | 'unassigned' | 'pending' | 'resolved';

const BUCKET_CASE = `
  CASE
    WHEN status = 'cerrado' THEN 'resolved'
    WHEN assigned_to_user_id IS NULL THEN 'unassigned'
    WHEN status = 'pendiente' THEN 'pending'
    ELSE 'attended'
  END
`;

const BUCKET_LABELS: Record<Bucket, string> = {
  attended: 'Atendidas',
  unassigned: 'Sin asignar',
  pending: 'Pendientes',
  resolved: 'Resueltas',
};

export interface ChangeMetric {
  value: number;
  previousValue: number;
  changePct: number;
  isPositive: boolean;
}

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Conversation)
    private repo: Repository<Conversation>,
  ) {}

  async getReport(placeId: string, fromStr?: string, toStr?: string) {
    const { from, to, prevFrom, prevTo } = this.resolveRange(fromStr, toStr);

    const [
      buckets,
      prevBuckets,
      contactsCount,
      prevContactsCount,
      conversationsByDay,
      conversationsByHour,
      conversationsByPhone,
      avgResponseSeconds,
      prevAvgResponseSeconds,
      avgResolutionSeconds,
      prevAvgResolutionSeconds,
      agentBase,
      agentResponseTimes,
      agentResolutionTimes,
    ] = await Promise.all([
      this.getStatusBuckets(placeId, from, to),
      this.getStatusBuckets(placeId, prevFrom, prevTo),
      this.getContactsCount(placeId, from, to),
      this.getContactsCount(placeId, prevFrom, prevTo),
      this.getConversationsByDay(placeId, from, to),
      this.getConversationsByHour(placeId, from, to),
      this.getConversationsByPhone(placeId, from, to),
      this.getAvgResponseSeconds(placeId, from, to),
      this.getAvgResponseSeconds(placeId, prevFrom, prevTo),
      this.getAvgResolutionSeconds(placeId, from, to),
      this.getAvgResolutionSeconds(placeId, prevFrom, prevTo),
      this.getAgentBase(placeId, from, to),
      this.getAgentResponseTimes(placeId, from, to),
      this.getAgentResolutionTimes(placeId, from, to),
    ]);

    const totalConversations = buckets.attended + buckets.unassigned + buckets.pending + buckets.resolved;
    const prevTotalConversations = prevBuckets.attended + prevBuckets.unassigned + prevBuckets.pending + prevBuckets.resolved;

    const kpis = {
      contacts: this.withChange(contactsCount, prevContactsCount),
      conversations: this.withChange(totalConversations, prevTotalConversations),
      attended: this.withChange(buckets.attended, prevBuckets.attended),
      unassigned: this.withChange(buckets.unassigned, prevBuckets.unassigned),
      pending: this.withChange(buckets.pending, prevBuckets.pending),
      resolved: this.withChange(buckets.resolved, prevBuckets.resolved),
    };

    const responseTime = this.withChange(avgResponseSeconds ?? 0, prevAvgResponseSeconds ?? 0, true);
    const resolutionTime = this.withChange(avgResolutionSeconds ?? 0, prevAvgResolutionSeconds ?? 0, true);

    const agentRanking = agentBase.map((a) => ({
      ...a,
      avgResponseSeconds: agentResponseTimes.find((r) => r.userId === a.userId)?.avgSeconds ?? null,
      avgResolutionSeconds: agentResolutionTimes.find((r) => r.userId === a.userId)?.avgSeconds ?? null,
    }));

    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      kpis,
      statusDistribution: (Object.keys(BUCKET_LABELS) as Bucket[]).map((bucket) => ({
        status: bucket,
        label: BUCKET_LABELS[bucket],
        count: buckets[bucket],
      })),
      conversationsByDay,
      conversationsByHour,
      conversationsByPhone,
      responseTime,
      resolutionTime,
      summary: {
        totalContacts: contactsCount,
        totalConversations,
        avgConversationsPerContact: contactsCount > 0 ? totalConversations / contactsCount : 0,
        attendedCount: buckets.attended,
        resolvedCount: buckets.resolved,
        resolutionRate: totalConversations > 0 ? buckets.resolved / totalConversations : 0,
        attentionRate: totalConversations > 0 ? buckets.attended / totalConversations : 0,
        avgResponseSeconds: avgResponseSeconds ?? 0,
        avgResolutionSeconds: avgResolutionSeconds ?? 0,
      },
      agentRanking,
    };
  }

  // Rango solicitado + el período inmediatamente anterior de igual duración, para las comparativas %
  private resolveRange(fromStr?: string, toStr?: string) {
    const to = toStr ? new Date(toStr) : new Date();
    const from = fromStr ? new Date(fromStr) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    const durationMs = Math.max(to.getTime() - from.getTime(), 1);
    const prevTo = new Date(from.getTime());
    const prevFrom = new Date(from.getTime() - durationMs);
    return { from, to, prevFrom, prevTo };
  }

  private withChange(value: number, previous: number, lowerIsBetter = false): ChangeMetric {
    let changePct: number;
    if (previous > 0) changePct = ((value - previous) / previous) * 100;
    else changePct = value > 0 ? 100 : 0;
    changePct = Math.round(changePct * 10) / 10;
    return {
      value,
      previousValue: previous,
      changePct,
      isPositive: lowerIsBetter ? changePct <= 0 : changePct >= 0,
    };
  }

  private async getStatusBuckets(placeId: string, from: Date, to: Date): Promise<Record<Bucket, number>> {
    const rows = await this.repo.query(
      `SELECT ${BUCKET_CASE} AS bucket, COUNT(*)::int AS count
       FROM wuarike_db.conversations
       WHERE place_id = $1 AND created_at >= $2 AND created_at < $3
       GROUP BY 1`,
      [placeId, from, to],
    );
    const result: Record<Bucket, number> = { attended: 0, unassigned: 0, pending: 0, resolved: 0 };
    for (const r of rows) result[r.bucket as Bucket] = Number(r.count);
    return result;
  }

  private async getContactsCount(placeId: string, from: Date, to: Date): Promise<number> {
    const rows = await this.repo.query(
      `SELECT COUNT(*)::int AS count FROM wuarike_db.contacts WHERE place_id = $1 AND created_at >= $2 AND created_at < $3`,
      [placeId, from, to],
    );
    return Number(rows[0]?.count ?? 0);
  }

  private async getConversationsByDay(placeId: string, from: Date, to: Date) {
    const rows = await this.repo.query(
      `WITH bucketed AS (
         SELECT date_trunc('day', created_at) AS day, ${BUCKET_CASE} AS bucket
         FROM wuarike_db.conversations
         WHERE place_id = $1 AND created_at >= $2 AND created_at < $3
       )
       SELECT
         to_char(day, 'YYYY-MM-DD') AS date,
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE bucket = 'attended')::int AS attended,
         COUNT(*) FILTER (WHERE bucket = 'pending')::int AS pending,
         COUNT(*) FILTER (WHERE bucket = 'resolved')::int AS resolved
       FROM bucketed
       GROUP BY day ORDER BY day`,
      [placeId, from, to],
    );
    return rows.map((r: any) => ({
      date: r.date,
      total: Number(r.total),
      attended: Number(r.attended),
      pending: Number(r.pending),
      resolved: Number(r.resolved),
    }));
  }

  private async getConversationsByHour(placeId: string, from: Date, to: Date) {
    const rows = await this.repo.query(
      `SELECT EXTRACT(HOUR FROM created_at)::int AS hour, COUNT(*)::int AS count
       FROM wuarike_db.conversations
       WHERE place_id = $1 AND created_at >= $2 AND created_at < $3
       GROUP BY 1 ORDER BY 1`,
      [placeId, from, to],
    );
    const byHour = new Map<number, number>(rows.map((r: any) => [Number(r.hour), Number(r.count)]));
    return Array.from({ length: 24 }, (_, hour) => ({ hour, count: byHour.get(hour) ?? 0 }));
  }

  private async getConversationsByPhone(placeId: string, from: Date, to: Date) {
    const rows = await this.repo.query(
      `WITH bucketed AS (
         SELECT customer_phone, customer_name, created_at, ${BUCKET_CASE} AS bucket
         FROM wuarike_db.conversations
         WHERE place_id = $1 AND created_at >= $2 AND created_at < $3
       )
       SELECT
         customer_phone AS phone,
         (ARRAY_AGG(customer_name ORDER BY created_at DESC))[1] AS contact_name,
         COUNT(*)::int AS conversations,
         MAX(created_at) AS last_conversation_at,
         (ARRAY_AGG(bucket ORDER BY created_at DESC))[1] AS status
       FROM bucketed
       GROUP BY customer_phone
       ORDER BY conversations DESC
       LIMIT 200`,
      [placeId, from, to],
    );
    return rows.map((r: any) => ({
      phone: r.phone,
      contactName: r.contact_name,
      conversations: Number(r.conversations),
      lastConversationAt: r.last_conversation_at,
      status: r.status as Bucket,
    }));
  }

  private async getAvgResponseSeconds(placeId: string, from: Date, to: Date): Promise<number | null> {
    const rows = await this.repo.query(
      `WITH first_times AS (
         SELECT c.id, c.created_at AS conv_start,
           MIN(m.created_at) FILTER (WHERE m.message_type = 'OUTGOING') AS first_response
         FROM wuarike_db.conversations c
         JOIN wuarike_db.messages m ON m.conversation_id = c.id
         WHERE c.place_id = $1 AND c.created_at >= $2 AND c.created_at < $3
         GROUP BY c.id, c.created_at
       )
       SELECT AVG(EXTRACT(EPOCH FROM (first_response - conv_start)))::float AS avg_seconds
       FROM first_times WHERE first_response IS NOT NULL`,
      [placeId, from, to],
    );
    return rows[0]?.avg_seconds != null ? Number(rows[0].avg_seconds) : null;
  }

  private async getAvgResolutionSeconds(placeId: string, from: Date, to: Date): Promise<number | null> {
    const rows = await this.repo.query(
      `SELECT AVG(EXTRACT(EPOCH FROM (closed_at - created_at)))::float AS avg_seconds
       FROM wuarike_db.conversations
       WHERE place_id = $1 AND status = 'cerrado' AND closed_at IS NOT NULL
         AND created_at >= $2 AND created_at < $3`,
      [placeId, from, to],
    );
    return rows[0]?.avg_seconds != null ? Number(rows[0].avg_seconds) : null;
  }

  private async getAgentBase(placeId: string, from: Date, to: Date) {
    const rows = await this.repo.query(
      `WITH bucketed AS (
         SELECT assigned_to_user_id, ${BUCKET_CASE} AS bucket
         FROM wuarike_db.conversations
         WHERE place_id = $1 AND created_at >= $2 AND created_at < $3
       )
       SELECT
         u.id AS user_id, u.full_name AS full_name,
         COUNT(b.assigned_to_user_id)::int AS conversations,
         COUNT(*) FILTER (WHERE b.bucket = 'attended')::int AS attended,
         COUNT(*) FILTER (WHERE b.bucket = 'resolved')::int AS resolved,
         COUNT(*) FILTER (WHERE b.bucket = 'pending')::int AS pending
       FROM wuarike_db.place_team_members ptm
       JOIN wuarike_db.users u ON u.id = ptm.user_id
       LEFT JOIN bucketed b ON b.assigned_to_user_id = u.id
       WHERE ptm.place_id = $1
       GROUP BY u.id, u.full_name
       ORDER BY conversations DESC`,
      [placeId, from, to],
    );
    return rows.map((r: any) => ({
      userId: r.user_id,
      fullName: r.full_name,
      conversations: Number(r.conversations),
      attended: Number(r.attended),
      resolved: Number(r.resolved),
      pending: Number(r.pending),
    }));
  }

  private async getAgentResponseTimes(placeId: string, from: Date, to: Date) {
    const rows = await this.repo.query(
      `WITH first_times AS (
         SELECT c.id, c.assigned_to_user_id, c.created_at AS conv_start,
           MIN(m.created_at) FILTER (WHERE m.message_type = 'OUTGOING') AS first_response
         FROM wuarike_db.conversations c
         JOIN wuarike_db.messages m ON m.conversation_id = c.id
         WHERE c.place_id = $1 AND c.created_at >= $2 AND c.created_at < $3
           AND c.assigned_to_user_id IS NOT NULL
         GROUP BY c.id, c.assigned_to_user_id, c.created_at
       )
       SELECT assigned_to_user_id AS user_id, AVG(EXTRACT(EPOCH FROM (first_response - conv_start)))::float AS avg_seconds
       FROM first_times WHERE first_response IS NOT NULL
       GROUP BY assigned_to_user_id`,
      [placeId, from, to],
    );
    return rows.map((r: any) => ({ userId: r.user_id, avgSeconds: Number(r.avg_seconds) }));
  }

  private async getAgentResolutionTimes(placeId: string, from: Date, to: Date) {
    const rows = await this.repo.query(
      `SELECT assigned_to_user_id AS user_id, AVG(EXTRACT(EPOCH FROM (closed_at - created_at)))::float AS avg_seconds
       FROM wuarike_db.conversations
       WHERE place_id = $1 AND status = 'cerrado' AND closed_at IS NOT NULL AND assigned_to_user_id IS NOT NULL
         AND created_at >= $2 AND created_at < $3
       GROUP BY assigned_to_user_id`,
      [placeId, from, to],
    );
    return rows.map((r: any) => ({ userId: r.user_id, avgSeconds: Number(r.avg_seconds) }));
  }
}

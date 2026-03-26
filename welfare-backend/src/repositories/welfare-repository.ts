import type { Pool, PoolClient } from 'pg';
import type {
  BlindboxItem,
  CheckinMode,
  CheckinRecord,
  WelfareSettings
} from '../types/domain.js';
import { config } from '../config.js';

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  throw new Error(`无法转换数值: ${String(value)}`);
}

export interface CreateCheckinInput {
  sub2apiUserId: number;
  linuxdoSubject: string;
  syntheticEmail: string;
  checkinDate: string;
  checkinMode: CheckinMode;
  blindboxItemId?: number | null;
  blindboxTitle?: string;
  rewardBalance: number;
  idempotencyKey: string;
}

export interface AdminWhitelistItem {
  id: number;
  linuxdoSubject: string;
  notes: string;
  createdAt: string;
}

export interface CreateBlindboxItemInput {
  title: string;
  rewardBalance: number;
  weight: number;
  enabled: boolean;
  notes: string;
  sortOrder: number;
}

export interface UpdateBlindboxItemInput {
  title?: string;
  rewardBalance?: number;
  weight?: number;
  enabled?: boolean;
  notes?: string;
  sortOrder?: number;
}

export class WelfareRepository {
  constructor(private readonly db: Pool) {}

  async getSettings(): Promise<WelfareSettings> {
    const result = await this.db.query(
      `SELECT checkin_enabled, blindbox_enabled, daily_reward_balance, timezone
       FROM welfare_settings
       WHERE id = 1`
    );
    if (result.rowCount === 0) {
      await this.db.query(
        `INSERT INTO welfare_settings (
           id,
           checkin_enabled,
           blindbox_enabled,
           daily_reward_balance,
           timezone
         )
         VALUES (1, $1, $2, $3, $4)
         ON CONFLICT (id) DO NOTHING`,
        [
          config.DEFAULT_CHECKIN_ENABLED,
          false,
          config.DEFAULT_DAILY_REWARD,
          config.DEFAULT_TIMEZONE
        ]
      );
      return this.getSettings();
    }

    const row = result.rows[0];
    return {
      checkinEnabled: Boolean(row.checkin_enabled),
      blindboxEnabled: Boolean(row.blindbox_enabled),
      dailyRewardBalance: toNumber(row.daily_reward_balance),
      timezone: String(row.timezone)
    };
  }

  async updateSettings(input: Partial<WelfareSettings>): Promise<WelfareSettings> {
    const current = await this.getSettings();
    const next = {
      checkinEnabled: input.checkinEnabled ?? current.checkinEnabled,
      blindboxEnabled: input.blindboxEnabled ?? current.blindboxEnabled,
      dailyRewardBalance: input.dailyRewardBalance ?? current.dailyRewardBalance,
      timezone: input.timezone ?? current.timezone
    };
    await this.db.query(
      `UPDATE welfare_settings
       SET checkin_enabled = $1,
           blindbox_enabled = $2,
           daily_reward_balance = $3,
           timezone = $4,
           updated_at = NOW()
       WHERE id = 1`,
      [
        next.checkinEnabled,
        next.blindboxEnabled,
        next.dailyRewardBalance,
        next.timezone
      ]
    );
    return next;
  }

  async listBlindboxItems(enabledOnly = false): Promise<BlindboxItem[]> {
    const conditions = enabledOnly ? 'WHERE enabled = TRUE' : '';
    const result = await this.db.query(
      `SELECT *
       FROM welfare_blindbox_items
       ${conditions}
       ORDER BY enabled DESC, sort_order ASC, reward_balance ASC, id ASC`
    );

    return result.rows.map((row) => this.mapBlindboxItem(row));
  }

  async getBlindboxItemById(id: number): Promise<BlindboxItem | null> {
    const result = await this.db.query(
      `SELECT *
       FROM welfare_blindbox_items
       WHERE id = $1
       LIMIT 1`,
      [id]
    );

    return result.rowCount ? this.mapBlindboxItem(result.rows[0]) : null;
  }

  async createBlindboxItem(input: CreateBlindboxItemInput): Promise<BlindboxItem> {
    const result = await this.db.query(
      `INSERT INTO welfare_blindbox_items (
         title,
         reward_balance,
         weight,
         enabled,
         notes,
         sort_order
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.title,
        input.rewardBalance,
        input.weight,
        input.enabled,
        input.notes,
        input.sortOrder
      ]
    );

    return this.mapBlindboxItem(result.rows[0]);
  }

  async updateBlindboxItem(
    id: number,
    input: UpdateBlindboxItemInput
  ): Promise<BlindboxItem | null> {
    const current = await this.getBlindboxItemById(id);
    if (!current) {
      return null;
    }

    const next = {
      title: input.title ?? current.title,
      rewardBalance: input.rewardBalance ?? current.rewardBalance,
      weight: input.weight ?? current.weight,
      enabled: input.enabled ?? current.enabled,
      notes: input.notes ?? current.notes,
      sortOrder: input.sortOrder ?? current.sortOrder
    };

    const result = await this.db.query(
      `UPDATE welfare_blindbox_items
       SET title = $2,
           reward_balance = $3,
           weight = $4,
           enabled = $5,
           notes = $6,
           sort_order = $7,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        next.title,
        next.rewardBalance,
        next.weight,
        next.enabled,
        next.notes,
        next.sortOrder
      ]
    );

    return result.rowCount ? this.mapBlindboxItem(result.rows[0]) : null;
  }

  async hasAdminSubject(linuxdoSubject: string): Promise<boolean> {
    const result = await this.db.query(
      `SELECT 1 FROM welfare_admin_whitelist WHERE linuxdo_subject = $1 LIMIT 1`,
      [linuxdoSubject]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listAdminWhitelist(): Promise<AdminWhitelistItem[]> {
    const result = await this.db.query(
      `SELECT id, linuxdo_subject, notes, created_at
       FROM welfare_admin_whitelist
       ORDER BY id ASC`
    );
    return result.rows.map((row) => ({
      id: Number(row.id),
      linuxdoSubject: String(row.linuxdo_subject),
      notes: String(row.notes ?? ''),
      createdAt: String(row.created_at)
    }));
  }

  async addAdminWhitelist(
    linuxdoSubject: string,
    notes: string
  ): Promise<AdminWhitelistItem> {
    const result = await this.db.query(
      `INSERT INTO welfare_admin_whitelist (linuxdo_subject, notes)
       VALUES ($1, $2)
       ON CONFLICT (linuxdo_subject)
       DO UPDATE SET notes = EXCLUDED.notes
       RETURNING id, linuxdo_subject, notes, created_at`,
      [linuxdoSubject, notes]
    );
    const row = result.rows[0];
    return {
      id: Number(row.id),
      linuxdoSubject: String(row.linuxdo_subject),
      notes: String(row.notes ?? ''),
      createdAt: String(row.created_at)
    };
  }

  async removeAdminWhitelist(id: number): Promise<boolean> {
    const result = await this.db.query(
      `DELETE FROM welfare_admin_whitelist WHERE id = $1`,
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async bootstrapAdminWhitelist(subjects: string[]): Promise<void> {
    if (subjects.length === 0) return;
    for (const subject of subjects) {
      await this.db.query(
        `INSERT INTO welfare_admin_whitelist (linuxdo_subject, notes)
         VALUES ($1, $2)
         ON CONFLICT (linuxdo_subject) DO NOTHING`,
        [subject, 'bootstrap']
      );
    }
  }

  async getCheckinByDate(
    sub2apiUserId: number,
    checkinDate: string
  ): Promise<CheckinRecord | null> {
    const result = await this.db.query(
      `SELECT *
       FROM welfare_checkins
       WHERE sub2api_user_id = $1 AND checkin_date = $2
       LIMIT 1`,
      [sub2apiUserId, checkinDate]
    );
    return result.rowCount ? this.mapCheckin(result.rows[0]) : null;
  }

  async getCheckinById(id: number): Promise<CheckinRecord | null> {
    const result = await this.db.query(
      `SELECT *
       FROM welfare_checkins
       WHERE id = $1
       LIMIT 1`,
      [id]
    );
    return result.rowCount ? this.mapCheckin(result.rows[0]) : null;
  }

  async createCheckinPending(input: CreateCheckinInput): Promise<CheckinRecord | null> {
    const result = await this.db.query(
      `INSERT INTO welfare_checkins (
         sub2api_user_id,
         linuxdo_subject,
         synthetic_email,
         checkin_date,
         checkin_mode,
         blindbox_item_id,
         blindbox_title,
         reward_balance,
         idempotency_key,
         grant_status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
       ON CONFLICT (sub2api_user_id, checkin_date) DO NOTHING
       RETURNING *`,
      [
        input.sub2apiUserId,
        input.linuxdoSubject,
        input.syntheticEmail,
        input.checkinDate,
        input.checkinMode,
        input.blindboxItemId ?? null,
        input.blindboxTitle ?? '',
        input.rewardBalance,
        input.idempotencyKey
      ]
    );
    return result.rowCount ? this.mapCheckin(result.rows[0]) : null;
  }

  async markCheckinPendingRetry(
    id: number
  ): Promise<CheckinRecord | null> {
    const result = await this.db.query(
      `UPDATE welfare_checkins
       SET grant_status = 'pending',
           grant_error = '',
           sub2api_request_id = '',
           updated_at = NOW()
       WHERE id = $1 AND grant_status = 'failed'
       RETURNING *`,
      [id]
    );
    return result.rowCount ? this.mapCheckin(result.rows[0]) : null;
  }

  async claimStalePending(
    id: number,
    staleAfterMs: number
  ): Promise<CheckinRecord | null> {
    const result = await this.db.query(
      `UPDATE welfare_checkins
       SET updated_at = NOW()
       WHERE id = $1
         AND grant_status = 'pending'
         AND updated_at <= NOW() - ($2::int * INTERVAL '1 millisecond')
       RETURNING *`,
      [id, staleAfterMs]
    );
    return result.rowCount ? this.mapCheckin(result.rows[0]) : null;
  }

  async markCheckinSuccess(
    id: number,
    requestId: string
  ): Promise<void> {
    await this.db.query(
      `UPDATE welfare_checkins
       SET grant_status = 'success',
           grant_error = '',
           sub2api_request_id = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [id, requestId]
    );
  }

  async markCheckinFailed(id: number, errorText: string): Promise<void> {
    await this.db.query(
      `UPDATE welfare_checkins
       SET grant_status = 'failed',
           grant_error = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [id, errorText]
    );
  }

  async listUserCheckins(
    sub2apiUserId: number,
    limit = 30
  ): Promise<CheckinRecord[]> {
    const result = await this.db.query(
      `SELECT *
       FROM welfare_checkins
       WHERE sub2api_user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [sub2apiUserId, limit]
    );
    return result.rows.map((row) => this.mapCheckin(row));
  }

  async queryAdminCheckins(params: {
    page: number;
    pageSize: number;
    dateFrom?: string;
    dateTo?: string;
    grantStatus?: string;
    subject?: string;
  }): Promise<{ items: CheckinRecord[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (params.dateFrom) {
      values.push(params.dateFrom);
      conditions.push(`checkin_date >= $${values.length}`);
    }
    if (params.dateTo) {
      values.push(params.dateTo);
      conditions.push(`checkin_date <= $${values.length}`);
    }
    if (params.grantStatus) {
      values.push(params.grantStatus);
      conditions.push(`grant_status = $${values.length}`);
    }
    if (params.subject) {
      values.push(`%${params.subject}%`);
      conditions.push(`linuxdo_subject ILIKE $${values.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (params.page - 1) * params.pageSize;

    const totalResult = await this.db.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM welfare_checkins ${whereClause}`,
      values
    );
    values.push(params.pageSize);
    values.push(offset);
    const listResult = await this.db.query(
      `SELECT *
       FROM welfare_checkins
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${values.length - 1}
       OFFSET $${values.length}`,
      values
    );

    return {
      items: listResult.rows.map((row) => this.mapCheckin(row)),
      total: Number(totalResult.rows[0]?.total ?? 0)
    };
  }

  async getDailyStats(startDate: string): Promise<
    Array<{
      checkinDate: string;
      checkinUsers: number;
      grantTotal: number;
    }>
  > {
    const result = await this.db.query(
      `SELECT checkin_date,
              COUNT(*)::int AS checkin_users,
              COALESCE(SUM(reward_balance), 0)::text AS grant_total
       FROM welfare_checkins
       WHERE grant_status = 'success'
         AND checkin_date >= $1::date
       GROUP BY checkin_date
       ORDER BY checkin_date ASC`,
      [startDate]
    );

    return result.rows.map((row) => ({
      checkinDate: String(row.checkin_date),
      checkinUsers: Number(row.checkin_users),
      grantTotal: toNumber(row.grant_total)
    }));
  }

  async getActiveUserCount(startDate: string): Promise<number> {
    const result = await this.db.query<{ total: string }>(
      `SELECT COUNT(DISTINCT sub2api_user_id)::text AS total
       FROM welfare_checkins
       WHERE grant_status = 'success'
         AND checkin_date >= $1::date`,
      [startDate]
    );

    return Number(result.rows[0]?.total ?? 0);
  }

  async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private mapBlindboxItem(row: Record<string, unknown>): BlindboxItem {
    return {
      id: Number(row.id),
      title: String(row.title),
      rewardBalance: toNumber(row.reward_balance),
      weight: Number(row.weight),
      enabled: Boolean(row.enabled),
      notes: String(row.notes ?? ''),
      sortOrder: Number(row.sort_order ?? 0),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at ?? row.created_at)
    };
  }

  private mapCheckin(row: Record<string, unknown>): CheckinRecord {
    return {
      id: Number(row.id),
      sub2apiUserId: Number(row.sub2api_user_id),
      linuxdoSubject: String(row.linuxdo_subject),
      syntheticEmail: String(row.synthetic_email),
      checkinDate: String(row.checkin_date),
      checkinMode:
        row.checkin_mode === 'blindbox' ? 'blindbox' : 'normal',
      blindboxItemId:
        row.blindbox_item_id == null ? null : Number(row.blindbox_item_id),
      blindboxTitle: String(row.blindbox_title ?? ''),
      rewardBalance: toNumber(row.reward_balance),
      idempotencyKey: String(row.idempotency_key),
      grantStatus: String(row.grant_status) as CheckinRecord['grantStatus'],
      grantError: String(row.grant_error ?? ''),
      sub2apiRequestId: String(row.sub2api_request_id ?? ''),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at ?? row.created_at)
    };
  }
}

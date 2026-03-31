import type { Pool, PoolClient } from 'pg';

export class SessionRepository {
  constructor(private readonly db: Pool) {}

  async purgeExpiredTokens(): Promise<number> {
    const result = await this.db.query(
      `DELETE FROM welfare_revoked_tokens
       WHERE expires_at <= NOW()`
    );

    return result.rowCount ?? 0;
  }

  async revokeToken(tokenId: string, expiresAtMs: number): Promise<void> {
    await this.db.query(
      `INSERT INTO welfare_revoked_tokens (token_id, expires_at)
       VALUES ($1, TO_TIMESTAMP($2 / 1000.0))
       ON CONFLICT (token_id) DO NOTHING`,
      [tokenId, expiresAtMs]
    );
  }

  async isTokenRevoked(tokenId: string): Promise<boolean> {
    const result = await this.db.query(
      `SELECT 1
       FROM welfare_revoked_tokens
       WHERE token_id = $1
         AND expires_at > NOW()
       LIMIT 1`,
      [tokenId]
    );

    return (result.rowCount ?? 0) > 0;
  }

  async getSessionVersion(
    sub2apiUserId: number,
    client?: PoolClient
  ): Promise<number> {
    const executor = client ?? this.db;
    await executor.query(
      `INSERT INTO welfare_user_security_states (sub2api_user_id)
       VALUES ($1)
       ON CONFLICT (sub2api_user_id) DO NOTHING`,
      [sub2apiUserId]
    );

    const result = await executor.query<{ session_version: string }>(
      `SELECT session_version::text AS session_version
       FROM welfare_user_security_states
       WHERE sub2api_user_id = $1
       LIMIT 1`,
      [sub2apiUserId]
    );

    return Number(result.rows[0]?.session_version ?? 1);
  }

  async bumpSessionVersion(
    sub2apiUserId: number,
    client?: PoolClient
  ): Promise<number> {
    const executor = client ?? this.db;
    const result = await executor.query<{ session_version: string }>(
      `INSERT INTO welfare_user_security_states (
         sub2api_user_id,
         session_version,
         updated_at
       )
       VALUES ($1, 2, NOW())
       ON CONFLICT (sub2api_user_id)
       DO UPDATE SET
         session_version = welfare_user_security_states.session_version + 1,
         updated_at = NOW()
       RETURNING session_version::text AS session_version`,
      [sub2apiUserId]
    );

    return Number(result.rows[0]?.session_version ?? 2);
  }
}

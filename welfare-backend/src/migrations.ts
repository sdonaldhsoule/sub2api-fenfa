import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationDir = path.resolve(__dirname, '../migrations');

export async function runMigrations(db: Pool): Promise<void> {
  const files = (await fs.readdir(migrationDir))
    .filter((name) => name.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));

  const client = await db.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS welfare_schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    for (const file of files) {
      const already = await client.query<{ filename: string }>(
        'SELECT filename FROM welfare_schema_migrations WHERE filename = $1',
        [file]
      );
      if (already.rowCount && already.rowCount > 0) {
        continue;
      }

      const fullPath = path.join(migrationDir, file);
      const sql = await fs.readFile(fullPath, 'utf8');
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO welfare_schema_migrations (filename) VALUES ($1)',
        [file]
      );
      await client.query('COMMIT');
      console.log(`[Migration] 已执行 ${file}`);
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}


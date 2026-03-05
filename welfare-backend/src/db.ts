import { Pool } from 'pg';
import { config } from './config.js';

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 10
});

pool.on('error', (error) => {
  console.error('[DB] 连接池异常', error);
});


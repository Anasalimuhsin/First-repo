// Applies db/migrations/*.sql in filename order, each once, each in its own
// transaction. Applied migrations are recorded in schema_migrations.
//   DATABASE_URL=... npm run db:migrate

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/lib/db.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../db/migrations');

export async function migrate(db = pool, log = console.log) {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const done = new Set((await db.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await fs.readFile(path.join(dir, file), 'utf8');
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      log(`applied ${file}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`${file}: ${error.message}`);
    } finally {
      client.release();
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // Serialise concurrent runs (e.g. several containers starting at once).
  const lock = await pool.connect();
  try {
    await lock.query('SELECT pg_advisory_lock(727274)');
    await migrate();
    console.log('migrations up to date');
  } finally {
    await lock.query('SELECT pg_advisory_unlock(727274)').catch(() => {});
    lock.release();
    await pool.end();
  }
}

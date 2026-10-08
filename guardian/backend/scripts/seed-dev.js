// Creates a demo family for local development and prints the bearer tokens.
//   DATABASE_URL=... DATABASE_SSL=false npm run seed

import { withTransaction, pool } from '../src/lib/db.js';
import { generateToken, hashToken } from '../src/lib/fieldCrypto.js';

const parentToken = generateToken();
const deviceToken = generateToken();

const ids = await withTransaction(async (db) => {
  const one = async (sql, params) => (await db.query(sql, params)).rows[0].id;

  const parentId = await one(
    `INSERT INTO parents (email, password_hash, full_name) VALUES ($1, 'dev-only', 'ولي أمر تجريبي') RETURNING id`,
    [`parent+${Date.now()}@example.com`],
  );
  const familyId = await one(`INSERT INTO families (name) VALUES ('عائلة تجريبية') RETURNING id`);
  await db.query(`INSERT INTO family_members (family_id, parent_id, role) VALUES ($1, $2, 'owner')`, [familyId, parentId]);
  const childId = await one(
    `INSERT INTO children (family_id, display_name, birth_year) VALUES ($1, 'سارة', 2013) RETURNING id`,
    [familyId],
  );
  await db.query(
    `INSERT INTO consents (child_id, parent_id, policy_version, scopes, method, child_notified)
     VALUES ($1, $2, '2026-10', '{content_monitoring,location,screen_time,llm_analysis}', 'dev_seed', true)`,
    [childId, parentId],
  );
  await db.query(
    `INSERT INTO parent_sessions (parent_id, token_hash, push_token, expires_at)
     VALUES ($1, $2, 'dev-push-token', now() + interval '30 days')`,
    [parentId, hashToken(parentToken)],
  );
  const deviceId = await one(
    `INSERT INTO devices (child_id, platform, model, token_hash) VALUES ($1, 'android', 'Pixel (dev)', $2) RETURNING id`,
    [childId, hashToken(deviceToken)],
  );
  await db.query(
    `INSERT INTO geofences (child_id, name, lat, lng, radius_m) VALUES ($1, 'المدرسة', 24.7136, 46.6753, 150)`,
    [childId],
  );
  await db.query(
    `INSERT INTO screen_time_schedules (child_id, name, days_of_week, starts_at, ends_at, mode)
     VALUES ($1, 'وقت النوم', '{0,1,2,3,4}', '21:30', '06:30', 'block_internet')`,
    [childId],
  );
  await db.query(
    `INSERT INTO filter_rules (family_id, target, value, action, created_by) VALUES ($1, 'web_category', 'adult', 'block', $2)`,
    [familyId, parentId],
  );
  return { parentId, childId, deviceId };
});

console.log(JSON.stringify({ ...ids, parentToken, deviceToken }, null, 2));
await pool.end();

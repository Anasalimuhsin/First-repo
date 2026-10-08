// Deletes data past its retention period. Safe to run any number of times.

import { pool } from '../lib/db.js';

const STATEMENTS = {
  alerts: 'DELETE FROM alerts WHERE expires_at < now()',
  locationPoints: 'DELETE FROM location_points WHERE expires_at < now()',
  geofenceEvents: 'DELETE FROM geofence_events WHERE expires_at < now()',
  sessions: `DELETE FROM parent_sessions WHERE expires_at < now() - interval '7 days' OR revoked_at < now() - interval '7 days'`,
  pairingCodes: `DELETE FROM pairing_codes WHERE expires_at < now() - interval '1 day'`,
  oauthStates: 'DELETE FROM oauth_states WHERE expires_at < now()',
  auditLog: `DELETE FROM audit_log WHERE at < now() - interval '1 year'`,
};

export async function runRetention() {
  const deleted = {};
  for (const [name, sql] of Object.entries(STATEMENTS)) {
    deleted[name] = (await pool.query(sql)).rowCount;
  }
  return deleted;
}

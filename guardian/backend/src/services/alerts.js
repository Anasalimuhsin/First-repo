// Turning analysed content into stored alerts + parent notifications.
// Shared by device ingestion, the Gmail worker and device image signals.

import { pool } from '../lib/db.js';
import { parentPushTokens } from '../lib/auth.js';
import { analyzeMessage } from '../analyzer/index.js';
import { CATEGORIES, SEVERITIES } from '../analyzer/lexicon.js';
import { MAX_BATCH } from '../analyzer/llmClassifier.js';

export const EXCERPT_LENGTH = 280;

const severityRank = (s) => SEVERITIES.indexOf(s);

async function loadSettings(childId) {
  const { rows } = await pool.query(
    'SELECT category, enabled, min_severity FROM alert_settings WHERE child_id = $1',
    [childId],
  );
  return new Map(rows.map((r) => [r.category, r]));
}

function passesSettings(settings, category, severity) {
  const setting = settings.get(category) ?? { enabled: true, min_severity: 'medium' };
  return setting.enabled && severityRank(severity) >= severityRank(setting.min_severity);
}

async function insertAlert({ childId, deviceId, source, direction, decision, excerpt, occurredAt, fieldCrypto }) {
  const { rows } = await pool.query(
    `INSERT INTO alerts (child_id, device_id, source, direction, category, severity, confidence,
                         detector, matched_terms, excerpt_enc, rationale_ar, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [childId, deviceId, source, direction, decision.category, decision.severity, decision.confidence,
     decision.detector, decision.matchedTerms ?? [], fieldCrypto.encrypt(excerpt, childId),
     decision.rationaleAr ?? null, occurredAt],
  );
  return rows[0].id;
}

async function notifyParents(childId, created, notifier) {
  if (created.length === 0) return;
  const { rows } = await pool.query('SELECT display_name FROM children WHERE id = $1', [childId]);
  const tokens = await parentPushTokens(childId);
  for (const alert of created) {
    await notifier.alertCreated({ parentPushTokens: tokens, childName: rows[0].display_name, alertId: alert.id, ...alert });
  }
}

/**
 * Pre-classify every item in batches (GUARDIAN_LLM_REVIEW=all). Returns an
 * array of per-item results (null entries = not classified).
 */
async function batchReview(items, classifyBatch) {
  const results = [];
  for (let i = 0; i < items.length; i += MAX_BATCH) {
    const chunk = items.slice(i, i + MAX_BATCH);
    results.push(...((await classifyBatch(chunk)) ?? chunk.map(() => null)));
  }
  return results;
}

/**
 * Analyse text items and store alerts for the risky ones. Text is never stored
 * beyond the short encrypted excerpt of an alert.
 *
 * @param {object} p
 * @param {Array<{source, direction, text, occurredAt}>} p.items
 * @param {string[]} p.scopes          active consent scopes for the child
 * @param {Function|null} p.classify   single-message LLM classifier
 * @param {Function|null} [p.classifyBatch]  batch classifier, used when
 *        GUARDIAN_LLM_REVIEW=all (every message reviewed, not only flagged ones)
 */
export async function processTextItems({
  childId, deviceId = null, items, scopes, classify, classifyBatch = null, fieldCrypto, notifier,
  reviewMode = process.env.GUARDIAN_LLM_REVIEW,
}) {
  const llmAllowed = scopes.includes('llm_analysis');
  const settings = await loadSettings(childId);
  const reviewAll = llmAllowed && reviewMode === 'all' && Boolean(classifyBatch);
  const batchResults = reviewAll ? await batchReview(items, classifyBatch) : null;

  const created = [];
  for (const [i, item] of items.entries()) {
    const pre = batchResults?.[i];
    const decision = await analyzeMessage(item, pre
      ? { classify: async () => pre, reviewAll: true }
      // No batch result: review only flagged messages, one at a time.
      : { classify: llmAllowed ? classify : null });
    if (!decision.alert || !passesSettings(settings, decision.category, decision.severity)) continue;
    const id = await insertAlert({
      childId, deviceId, source: item.source, direction: item.direction, decision,
      excerpt: item.text.slice(0, EXCERPT_LENGTH), occurredAt: item.occurredAt, fieldCrypto,
    });
    created.push({ id, category: decision.category, severity: decision.severity, labelAr: decision.labelAr });
  }
  await notifyParents(childId, created, notifier);
  return created;
}

// Labels an on-device image classifier may report, mapped to alert
// categories. Images themselves never leave the device.
export const IMAGE_LABELS = {
  nudity: { category: 'explicit_content', labelAr: 'صور غير لائقة' },
  self_harm: { category: 'self_harm', labelAr: CATEGORIES.self_harm.labelAr },
  weapon: { category: 'violence', labelAr: CATEGORIES.violence.labelAr },
  drugs: { category: 'drugs', labelAr: CATEGORIES.drugs.labelAr },
};

function imageSeverity(label, score) {
  if (label === 'nudity' || label === 'self_harm') return score >= 0.9 ? 'critical' : 'high';
  return score >= 0.9 ? 'high' : 'medium';
}

/** Store alerts for image classifications made on the child's device. */
export async function processImageSignals({ childId, deviceId, items, fieldCrypto, notifier, threshold = 0.7 }) {
  const settings = await loadSettings(childId);
  const created = [];
  for (const item of items) {
    const top = item.labels
      .filter((l) => IMAGE_LABELS[l.label] && l.score >= threshold)
      .sort((a, b) => b.score - a.score)[0];
    if (!top) continue;
    const { category, labelAr } = IMAGE_LABELS[top.label];
    const severity = imageSeverity(top.label, top.score);
    if (!passesSettings(settings, category, severity)) continue;

    const decision = {
      category, severity, confidence: top.score, detector: 'device_image',
      matchedTerms: [top.label], rationaleAr: `صنّف الجهاز صورة على أنها: ${labelAr}`,
    };
    // The "excerpt" for an image is a description only — never the image.
    const excerpt = `[صورة] ${labelAr} (${Math.round(top.score * 100)}%)`;
    const id = await insertAlert({
      childId, deviceId, source: item.source, direction: item.direction, decision,
      excerpt, occurredAt: item.occurredAt, fieldCrypto,
    });
    created.push({ id, category, severity, labelAr });
  }
  await notifyParents(childId, created, notifier);
  return created;
}

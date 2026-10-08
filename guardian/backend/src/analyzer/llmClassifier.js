// Contextual classifier using Claude. It adds what keyword rules can't:
// paraphrase, sarcasm, banter between friends, quoted lyrics, and worrying
// messages that use none of the listed words.
//
// Two entry points:
//   classifyWithLLM(item)        one message (review of rule/triage-flagged items)
//   classifyBatchWithLLM(items)  many messages in one request (GUARDIAN_LLM_REVIEW=all)
//
// Only used for children whose parents granted the "llm_analysis" scope.
// No names or ids are sent — only message text, source and direction.

import Anthropic from '@anthropic-ai/sdk';
import { CATEGORIES, SEVERITIES } from './lexicon.js';
import { logger } from '../lib/logger.js';

const MODEL = process.env.GUARDIAN_LLM_MODEL || 'claude-opus-5-5';
export const MAX_BATCH = 25;

const CATEGORY_KEYS = [...Object.keys(CATEGORIES), 'none'];

const RESULT_PROPERTIES = {
  category: { type: 'string', enum: CATEGORY_KEYS },
  severity: { type: 'string', enum: SEVERITIES },
  confidence: { type: 'number' },
  rationale_ar: { type: 'string' },
};
const RESULT_REQUIRED = ['category', 'severity', 'confidence', 'rationale_ar'];

const SINGLE_SCHEMA = {
  type: 'object', properties: RESULT_PROPERTIES, required: RESULT_REQUIRED, additionalProperties: false,
};

const BATCH_SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: { index: { type: 'integer' }, ...RESULT_PROPERTIES },
        required: ['index', ...RESULT_REQUIRED],
        additionalProperties: false,
      },
    },
  },
  required: ['results'],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You assist a parental child-safety service. You read messages sent to or from a child (age 8-17) and decide whether each one shows real risk to the child. Parents are alerted only for real risk, so precision matters — but missing a child in danger is far worse than a false alarm.

Categories: ${Object.entries(CATEGORIES).map(([k, v]) => `${k} (${v.labelAr})`).join(', ')}, or none.

Some messages arrive with hints: keyword_hits (exact-phrase rules) or triage_categories (a deliberately broad pre-filter that passes many harmless messages). Hints are only hints; judge the message itself.

Guidance:
- Messages are often Arabic (any dialect), English, or mixed Arabizi (Arabic in Latin letters and digits, e.g. "7" for ح, "3" for ع). Read them in that context.
- Banter between friends, gaming trash talk, song lyrics and obvious hyperbole ("I'm dying of laughter", "الواجب بيقتلني") are "none" or "low".
- Indirect signs of suicidal thinking count: feeling like a burden, giving possessions away, saying goodbye, "won't be around much longer", wanting everything to stop. Any credible sign the child may hurt themselves is at least "high"; a stated plan, method or timeline is "critical".
- An adult or stranger seeking secrecy, photos, personal details, moving to a private app, flattery about maturity, gifts, or a private meeting is grooming, even if polite.
- Drug slang and coded threats count when the meaning is clear in context.
- When genuinely unsure between two severities, choose the higher one.
- rationale_ar is one short sentence in Arabic for the parent. Do not quote the message.`;

let defaultClient;
function getClient() {
  defaultClient ??= new Anthropic();
  return defaultClient;
}

function normalizeResult(r) {
  return {
    category: r.category,
    severity: r.severity,
    confidence: Math.min(1, Math.max(0, Number(r.confidence) || 0)),
    rationaleAr: r.rationale_ar,
  };
}

/** One request; returns the parsed JSON object, or null on any failure. */
async function request(client, userContent, schema, maxTokens) {
  let response;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema } },
      // Stable system prompt first so it can be served from the prompt cache.
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userContent }],
    });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      logger.warn('llm rate limited; falling back to rules');
    } else if (error instanceof Anthropic.APIError) {
      logger.error({ status: error.status, msg: error.message }, 'llm API error');
    } else {
      logger.error({ err: error.message }, 'llm request failed');
    }
    return null;
  }

  if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') {
    logger.warn({ stopReason: response.stop_reason }, 'llm returned no classification');
    return null;
  }
  const text = response.content.find((b) => b.type === 'text')?.text;
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    logger.error('llm output was not valid JSON');
    return null;
  }
}

/**
 * Classify one message.
 *
 * @param {object} input  { text, source, direction, ruleHits, triageCategories? }
 * @param {object} [options]
 * @param {Anthropic} [options.client] Injectable for tests.
 * @returns {Promise<null | {category, severity, confidence, rationaleAr}>}
 *          null when the LLM is unavailable or declined; callers must then
 *          fall back to the rule-engine result.
 */
export async function classifyWithLLM(input, { client = getClient() } = {}) {
  const parsed = await request(client, JSON.stringify({
    source: input.source,
    direction: input.direction,
    keyword_hits: (input.ruleHits ?? []).map((h) => ({ category: h.category, score: h.score })),
    triage_categories: input.triageCategories ?? [],
    message: input.text,
  }), SINGLE_SCHEMA, 4000);
  return parsed ? normalizeResult(parsed) : null;
}

/**
 * Classify up to MAX_BATCH messages in one request (much cheaper per message
 * than one request each). Returns an array aligned with `items`; an entry is
 * null if the model omitted it, and the whole array is null on failure.
 */
export async function classifyBatchWithLLM(items, { client = getClient() } = {}) {
  if (items.length === 0) return [];
  if (items.length > MAX_BATCH) throw new Error(`classifyBatchWithLLM: at most ${MAX_BATCH} items`);
  const parsed = await request(client, JSON.stringify({
    instructions: 'Classify each message independently. Return one result per index.',
    messages: items.map((m, index) => ({ index, source: m.source, direction: m.direction, message: m.text })),
  }), BATCH_SCHEMA, 8000 + items.length * 300);
  if (!parsed) return null;
  const out = new Array(items.length).fill(null);
  for (const r of parsed.results ?? []) {
    if (Number.isInteger(r.index) && r.index >= 0 && r.index < items.length) out[r.index] = normalizeResult(r);
  }
  return out;
}

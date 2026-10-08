// Second-pass classifier using Claude. Only called for messages the rule
// engine flagged, so the LLM sees a small fraction of traffic. It adds context
// the keyword rules can't: sarcasm, jokes between friends, quoted song lyrics,
// or a worrying message that uses none of the listed words.

import Anthropic from '@anthropic-ai/sdk';
import { CATEGORIES, SEVERITIES } from './lexicon.js';

const MODEL = process.env.GUARDIAN_LLM_MODEL || 'claude-opus-5-5';

const CATEGORY_KEYS = [...Object.keys(CATEGORIES), 'none'];

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    category: { type: 'string', enum: CATEGORY_KEYS },
    severity: { type: 'string', enum: SEVERITIES },
    confidence: { type: 'number' },
    rationale_ar: { type: 'string' },
  },
  required: ['category', 'severity', 'confidence', 'rationale_ar'],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You assist a parental child-safety service. A message from or to a child (age 8-17) was flagged by keyword rules. Decide whether it shows real risk to the child.

Categories: ${Object.entries(CATEGORIES).map(([k, v]) => `${k} (${v.labelAr})`).join(', ')}, or none.

Guidance:
- Messages are often Arabic (any dialect), English, or mixed Arabizi. Read them in that context.
- Banter between friends, gaming trash talk, song lyrics and obvious hyperbole ("I'm dying of laughter") are usually "none" or "low".
- Any credible sign the child may hurt themselves is at least "high"; a stated plan, method or timeline is "critical".
- An adult asking a child for secrecy, photos, personal details or a private meeting is grooming, even if polite.
- Be conservative: when genuinely unsure between two severities, choose the higher one.
- rationale_ar is one short sentence in Arabic for the parent. Do not quote the message.`;

let defaultClient;
function getClient() {
  defaultClient ??= new Anthropic();
  return defaultClient;
}

/**
 * Classify one flagged message.
 *
 * @param {object} input
 * @param {string} input.text         The message text.
 * @param {string} input.source       e.g. "sms", "instagram", "email".
 * @param {string} input.direction    "incoming" | "outgoing".
 * @param {object[]} input.ruleHits   Output of scoreText(), as a hint.
 * @param {object} [options]
 * @param {Anthropic} [options.client] Injectable for tests.
 * @returns {Promise<null | {category, severity, confidence, rationaleAr}>}
 *          null when the LLM is unavailable or declined; callers must then
 *          fall back to the rule-engine result.
 */
export async function classifyWithLLM(input, { client = getClient() } = {}) {
  const userContent = JSON.stringify({
    source: input.source,
    direction: input.direction,
    keyword_hits: input.ruleHits.map((h) => ({ category: h.category, score: h.score })),
    message: input.text,
  });

  let response;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
      },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      console.warn('[llm] rate limited; using rule result');
    } else if (error instanceof Anthropic.APIError) {
      console.error(`[llm] API error ${error.status}: ${error.message}`);
    } else {
      console.error('[llm] request failed:', error.message);
    }
    return null;
  }

  if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') {
    console.warn(`[llm] no classification (stop_reason=${response.stop_reason})`);
    return null;
  }

  const text = response.content.find((b) => b.type === 'text')?.text;
  if (!text) return null;

  try {
    const parsed = JSON.parse(text);
    return {
      category: parsed.category,
      severity: parsed.severity,
      confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0)),
      rationaleAr: parsed.rationale_ar,
    };
  } catch {
    console.error('[llm] could not parse classifier output');
    return null;
  }
}

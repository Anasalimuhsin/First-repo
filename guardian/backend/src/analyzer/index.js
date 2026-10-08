// Analysis pipeline: rules first, LLM second, with a safety floor so the LLM
// can never silence a critical rule hit.

import { scoreText, maxSeverity, ALERT_THRESHOLD, REVIEW_THRESHOLD } from './ruleEngine.js';
import { CATEGORIES } from './lexicon.js';
import { triage } from './triage.js';

const NO_ALERT = Object.freeze({ alert: false });

function decision({ category, severity, confidence, detector, matchedTerms, rationaleAr }) {
  return {
    alert: true,
    category,
    severity,
    confidence,
    detector,
    matchedTerms,
    rationaleAr: rationaleAr ?? null,
    labelAr: CATEGORIES[category]?.labelAr ?? category,
    parentGuidanceAr: CATEGORIES[category]?.parentGuidanceAr ?? null,
  };
}

function isAlertable(hit) {
  return hit.score >= ALERT_THRESHOLD || hit.severity === 'high' || hit.severity === 'critical';
}

function ruleDecision(top) {
  if (!isAlertable(top)) return NO_ALERT;
  return decision({
    category: top.category,
    severity: top.severity,
    confidence: Math.min(1, top.score),
    detector: 'rules',
    matchedTerms: top.matchedTerms,
  });
}

/**
 * Analyze one message.
 *
 * @param {object} input  { text, source, direction }
 * @param {object} [options]
 * @param {Function|null} [options.classify]  Async LLM classifier
 *        (see llmClassifier.js). Pass null to run rules only.
 * @param {boolean} [options.reviewAll]  Ask the LLM about every message, not
 *        only rule/triage-flagged ones (GUARDIAN_LLM_REVIEW=all).
 */
export async function analyzeMessage(input, { classify = null, reviewAll = false } = {}) {
  const hits = scoreText(input.text);
  const top = hits[0];
  const ruleSignal = Boolean(top && top.score >= REVIEW_THRESHOLD);

  if (!classify) return ruleSignal ? ruleDecision(top) : NO_ALERT;

  // With an LLM available, also review messages that only the broad triage
  // flagged: exact-phrase rules miss most paraphrased risk.
  const triaged = ruleSignal ? [] : triage(input.text);
  if (!ruleSignal && triaged.length === 0 && !reviewAll) return NO_ALERT;

  const rules = ruleSignal ? ruleDecision(top) : NO_ALERT;
  const llm = await classify({ ...input, ruleHits: hits, triageCategories: triaged });
  if (!llm) return rules; // LLM unavailable → rules decide alone

  // Safety floor: critical hits and self-harm signals always alert, whatever
  // the LLM says. A missed self-harm alert costs far more than a false one.
  const floor = hits.find(
    (h) => h.severity === 'critical' || (h.category === 'self_harm' && isAlertable(h)),
  );
  if (floor) {
    const sameCategory = llm.category === floor.category;
    return decision({
      category: floor.category,
      severity: sameCategory ? maxSeverity(llm.severity, floor.severity) : floor.severity,
      confidence: Math.max(Math.min(1, floor.score), sameCategory ? llm.confidence : 0),
      detector: 'rules+llm',
      matchedTerms: floor.matchedTerms,
      rationaleAr: sameCategory ? llm.rationaleAr : null,
    });
  }

  if (llm.category === 'none' || llm.severity === 'low') return NO_ALERT;

  const ruleForLlmCategory = hits.find((h) => h.category === llm.category);
  return decision({
    category: llm.category,
    severity: ruleForLlmCategory ? maxSeverity(llm.severity, ruleForLlmCategory.severity) : llm.severity,
    confidence: llm.confidence,
    detector: ruleSignal ? 'rules+llm' : 'llm',
    matchedTerms: ruleForLlmCategory?.matchedTerms ?? [],
    rationaleAr: llm.rationaleAr,
  });
}

export { scoreText } from './ruleEngine.js';
export { normalize } from './normalize.js';

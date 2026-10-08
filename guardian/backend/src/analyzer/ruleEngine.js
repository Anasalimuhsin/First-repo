// Fast, local, deterministic first pass. Runs on every message; only messages
// that hit something are considered further (and possibly sent to the LLM).

import { normalize } from './normalize.js';
import { CATEGORIES, SEVERITIES } from './lexicon.js';

export const ALERT_THRESHOLD = 0.6; // category score at which we alert
export const REVIEW_THRESHOLD = 0.2; // below this, signals are treated as noise

// Arabic clitics that attach to the start of a word: و ف ب ل ك and ال.
const AR_PREFIX = '(?:[وفبلك]?(?:ال)?)';
const BOUNDARY_BEFORE = '(?<![\\p{L}\\p{N}])';
const BOUNDARY_AFTER = '(?![\\p{L}\\p{N}])';

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const phraseToPattern = (phrase) => normalize(phrase).split(' ').map(escapeRegex).join('\\s+');

function compileTerm(phrase, isArabic, notFollowedBy = []) {
  const prefix = isArabic ? AR_PREFIX : '';
  const guard = notFollowedBy.length ? `(?!\\s+(?:${notFollowedBy.map(phraseToPattern).join('|')})${BOUNDARY_AFTER})` : '';
  return new RegExp(`${BOUNDARY_BEFORE}${prefix}${phraseToPattern(phrase)}${BOUNDARY_AFTER}${guard}`, 'u');
}

function compileLexicon(categories) {
  const compiled = [];
  for (const [category, def] of Object.entries(categories)) {
    def.terms.forEach((term, index) => {
      // ar / en / az may each be a string or an array of variants.
      // az = Arabizi (Arabic in Latin letters + digits). It goes through the
      // same normalization as the message, so "3" / "7" spellings line up.
      const variants = [
        ...[term.ar ?? []].flat().map((p) => ['ar', p]),
        ...[term.en ?? []].flat().map((p) => ['en', p]),
        ...[term.az ?? []].flat().map((p) => ['az', p]),
      ];
      for (const [lang, phrase] of variants) {
        compiled.push({
          id: `${category}:${index}`,
          category,
          phrase,
          regex: compileTerm(phrase, lang === 'ar', def.notFollowedBy),
          weight: term.weight,
          severity: term.severity,
        });
      }
    });
  }
  return compiled;
}

const COMPILED = compileLexicon(CATEGORIES);

export function maxSeverity(a, b) {
  return SEVERITIES.indexOf(a) >= SEVERITIES.indexOf(b) ? a : b;
}

function severityFromScore(score) {
  if (score >= 1.5) return 'high';
  if (score >= ALERT_THRESHOLD) return 'medium';
  return 'low';
}

/**
 * Score a single message against the lexicon.
 *
 * Returns one entry per category that had any match, sorted by score. A
 * category's severity is the higher of (a) the strongest single term and
 * (b) a severity derived from the accumulated score, so several weak signals
 * together can still raise an alert.
 */
export function scoreText(text) {
  const normalized = normalize(text);
  if (!normalized) return [];

  const byCategory = new Map();
  for (const term of COMPILED) {
    if (!term.regex.test(normalized)) continue;
    const entry = byCategory.get(term.category) ?? {
      category: term.category,
      score: 0,
      severity: 'low',
      matchedTerms: [],
      termIds: new Set(),
    };
    // The same term matched in both languages counts once.
    if (!entry.termIds.has(term.id)) {
      entry.termIds.add(term.id);
      entry.score += term.weight;
      entry.matchedTerms.push(term.phrase);
      entry.severity = maxSeverity(entry.severity, term.severity);
    }
    byCategory.set(term.category, entry);
  }

  return [...byCategory.values()]
    .map(({ termIds, ...e }) => ({
      ...e,
      score: Math.round(e.score * 100) / 100,
      severity: maxSeverity(e.severity, severityFromScore(e.score)),
    }))
    .sort((a, b) => b.score - a.score);
}

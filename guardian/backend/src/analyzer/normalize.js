// Text normalization so that keyword rules survive common spelling variants,
// diacritics, letter stretching ("مووووت") and leetspeak ("k1ll ur5elf").

const ARABIC_DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g;
const TATWEEL = /ـ/g;

const ARABIC_LETTER_MAP = {
  'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا',
  'ى': 'ي', 'ئ': 'ي',
  'ؤ': 'و',
  'ة': 'ه',
};

const LEET_MAP = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's',
};

// Arabic-Indic digits → ASCII, so "٣" is treated like "3".
const ARABIC_DIGITS = /[٠-٩]/g;

/**
 * Normalize text for matching. The output is only used for detection and is
 * never stored.
 */
export function normalize(text) {
  if (typeof text !== 'string') return '';

  let out = text.normalize('NFKC').toLowerCase();
  out = out.replace(ARABIC_DIGITS, (d) => String(d.charCodeAt(0) - 0x0660));
  out = out.replace(ARABIC_DIACRITICS, '').replace(TATWEEL, '');
  out = out.replace(/[أإآٱىئؤة]/g, (ch) => ARABIC_LETTER_MAP[ch]);

  // Leetspeak only inside latin words: "k1ll" → "kill", but "2024" stays.
  out = out.replace(/[a-z0-9@$]+/g, (word) =>
    /[a-z]/.test(word) ? word.replace(/[013457@$]/g, (c) => LEET_MAP[c]) : word,
  );

  // Collapse letters repeated 3+ times ("soooo" → "so", "مووووت" → "موت").
  out = out.replace(/(\p{L})\1{2,}/gu, '$1');

  // Punctuation and emoji become spaces; keep letters, digits and whitespace.
  out = out.replace(/[^\p{L}\p{N}\s]/gu, ' ');
  return out.replace(/\s+/g, ' ').trim();
}

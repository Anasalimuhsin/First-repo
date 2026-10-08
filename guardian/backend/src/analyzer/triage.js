// High-recall triage: decides which messages are worth an LLM review even
// when no lexicon rule matched. It is deliberately broad (many benign
// messages pass it) and never creates an alert on its own — it only buys a
// second look. Held-out evaluation showed exact-phrase rules alone miss most
// paraphrased risk; this stage closes that gap when LLM analysis is enabled.
//
// Entries are word *stems*: they must start a word (Arabic clitics allowed)
// but may continue ("حيات" matches "حياتي", "suicid" matches "suicidal").

import { normalize } from './normalize.js';

export const TRIAGE_STEMS = {
  self_harm: [
    'موت', 'اموت', 'نموت', 'ميت', 'انتحر', 'انتحار', 'حيات', 'اخلص', 'بخلص', 'نهي', 'وداع', 'للابد', 'ارتاح', 'اصحى',
    'حبوب', 'حبه', 'دم', 'جرح', 'اجرح', 'اذي', 'معنى', 'اختفي', 'تعبت', 'يأس', 'ياس',
    'die', 'dead', 'death', 'suicid', 'kill', 'kms', 'end it', 'ending it', 'goodbye', 'forever', 'pills', 'overdose',
    'cut', 'bled', 'blood', 'scratch', 'hurt', 'deserve', 'disappear', 'worthless', 'hopeless', 'amoot', 'mot ', 'ant7er',
  ],
  bullying: [
    'قبيح', 'يقرف', 'مقرف', 'يخوف', 'بقره', 'سمين', 'عار', 'فاشل', 'غبي', 'تكره', 'نكره', 'يكره', 'يضحك', 'نضحك', 'فضيح', 'افضح',
    'ننشر', 'انشر', 'ننزل', 'بنزل', 'فيديو', 'القروب', 'محد', 'ما احد', 'انتحر',
    'ugly', 'fat', 'freak', 'loser', 'hate you', 'laugh at', 'stand you', 'nobody', 'no one', 'disappear', 'expose', 'leak', 'kys',
  ],
  grooming: [
    'سر', 'بيني وبينك', 'اهلك', 'امك', 'ابوك', 'ماما', 'بابا', 'صور', 'صوره', 'كاميرا', 'لابس', 'بيجام', 'جسم', 'ملابس', 'عمرك',
    'بيتكم', 'ساكن', 'مدرست', 'لحال', 'ناضج', 'اكبر منك', 'افهمك', 'حبيبت', 'هديه', 'فلوس', 'شدات', 'اخذك', 'بمر عليك',
    'secret', 'parents', 'mom', 'dad', 'pic', 'photo', 'selfie', 'camera', 'cam', 'wearing', 'body', 'clothes', 'how old',
    'address', 'alone', 'mature', 'boyfriend', 'girlfriend', 'private', 'snapchat', 'snap', 'telegram', 'vbucks', 'robux',
    'gift', 'trouble', "don't tell", 'dont tell', 'need to know', 'pick you up',
  ],
  violence: [
    'قتل', 'اقتل', 'بقتل', 'ذبح', 'اذبح', 'سلاح', 'مسدس', 'رصاص', 'سكين', 'اطعن', 'بطعن', 'اضرب', 'بضرب', 'كسر', 'بكسر', 'عظام',
    'تندم', 'لاخليك', 'فجر', 'بفجر',
    'kill', 'gun', 'shoot', 'stab', 'knife', 'jump him', 'jump her', 'beat', 'hurt you', 'never walk', 'bomb', 'weapon', 'a2tlak',
  ],
  drugs: [
    'حشيش', 'مخدر', 'حبوب', 'حبه', 'حبة', 'كبتاجون', 'ورق لف', 'تطير', 'فوق', 'سطل', 'مسطول', 'شبو',
    'weed', 'high', 'blunt', 'joint', 'carts', 'plug', 'pills', 'xanax', 'perc', 'vape', 'edible', 'molly', 'lean', 'stoned',
  ],
};

const BOUNDARY_BEFORE = '(?<![\\p{L}\\p{N}])';
const AR_PREFIX = '(?:[وفبلك]?(?:ال)?)';
const isArabic = (s) => /\p{Script=Arabic}/u.test(s);
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const COMPILED = Object.entries(TRIAGE_STEMS).map(([category, stems]) => ({
  category,
  regex: new RegExp(
    stems.map((s) => `${BOUNDARY_BEFORE}${isArabic(s) ? AR_PREFIX : ''}${normalize(s).split(' ').map(escape).join('\\s+')}`).join('|'),
    'u',
  ),
}));

/** Categories whose triage stems appear in the text (possibly empty). */
export function triage(text) {
  const normalized = normalize(text);
  if (!normalized) return [];
  return COMPILED.filter((c) => c.regex.test(normalized)).map((c) => c.category);
}

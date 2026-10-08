export const CATEGORY_LABELS: Record<string, string> = {
  self_harm: 'إيذاء النفس',
  bullying: 'تنمّر',
  grooming: 'استدراج / تحرّش',
  violence: 'عنف / تهديد',
  drugs: 'مخدرات',
  explicit_content: 'محتوى غير لائق',
  other: 'أخرى',
};

export const SEVERITY_LABELS: Record<string, string> = {
  low: 'منخفضة', medium: 'متوسطة', high: 'عالية', critical: 'حرجة',
};

export const STATUS_LABELS: Record<string, string> = {
  new: 'جديد', viewed: 'تمت المشاهدة', resolved: 'تمت المعالجة', dismissed: 'تم التجاهل',
};

export const SOURCE_LABELS: Record<string, string> = {
  sms: 'رسائل SMS', email: 'البريد', instagram: 'Instagram', tiktok: 'TikTok', snapchat: 'Snapchat',
  whatsapp: 'WhatsApp', discord: 'Discord', youtube: 'YouTube', web: 'الويب', other: 'أخرى',
};

export const SCOPE_LABELS: Record<string, { title: string; detail: string }> = {
  content_monitoring: {
    title: 'مراقبة المحتوى',
    detail: 'تحليل نصوص الإشعارات والرسائل لرصد الخطر. لا تُحفظ الرسائل؛ يُحفظ مقتطف قصير مشفّر من الرسائل المقلقة فقط.',
  },
  location: { title: 'الموقع', detail: 'الموقع الحالي وتنبيهات الوصول والمغادرة. يُحذف سجل المواقع بعد 30 يوماً.' },
  screen_time: { title: 'وقت الشاشة والتصفية', detail: 'جداول الاستخدام والحدود اليومية وحظر المواقع والتطبيقات على الجهاز.' },
  llm_analysis: {
    title: 'التحليل بالذكاء الاصطناعي (طرف ثالث)',
    detail: 'إرسال نص الرسائل (دون اسم الطفل أو أي معرّف) إلى مزوّد ذكاء اصطناعي (Anthropic) لفهم السياق وتقليل الإنذارات الخاطئة. اختياري.',
  },
};

export const DAY_LABELS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export const WEB_CATEGORIES: Record<string, string> = {
  adult: 'محتوى للبالغين', gambling: 'قمار', violence: 'عنف', drugs: 'مخدرات', social_media: 'تواصل اجتماعي',
  gaming: 'ألعاب', dating: 'مواعدة', proxy_vpn: 'تجاوز الحجب (VPN/Proxy)',
};

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

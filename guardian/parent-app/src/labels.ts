export const CATEGORY_LABELS: Record<string, string> = {
  self_harm: 'إيذاء النفس', bullying: 'تنمّر', grooming: 'استدراج / تحرّش', violence: 'عنف / تهديد',
  drugs: 'مخدرات', explicit_content: 'محتوى غير لائق', other: 'أخرى',
};
export const SEVERITY_LABELS: Record<string, string> = { low: 'منخفضة', medium: 'متوسطة', high: 'عالية', critical: 'حرجة' };
export const STATUS_LABELS: Record<string, string> = { new: 'جديد', viewed: 'تمت المشاهدة', resolved: 'تمت المعالجة', dismissed: 'تم التجاهل' };
export const SOURCE_LABELS: Record<string, string> = {
  sms: 'SMS', email: 'البريد', instagram: 'Instagram', tiktok: 'TikTok', snapchat: 'Snapchat',
  whatsapp: 'WhatsApp', discord: 'Discord', youtube: 'YouTube', web: 'الويب', other: 'أخرى',
};
export function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

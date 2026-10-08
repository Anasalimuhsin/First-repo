import Link from 'next/link';
import { api } from '@/lib/api';
import { SOURCE_LABELS, STATUS_LABELS, formatDate } from '@/lib/labels';
import type { AlertDetail } from '@/lib/types';
import { SeverityBadge } from '@/components/AlertList';
import { AlertActions } from '@/components/AlertActions';

const DETECTOR_LABELS: Record<string, string> = {
  rules: 'قواعد الكلمات', 'rules+llm': 'قواعد الكلمات + الذكاء الاصطناعي', llm: 'الذكاء الاصطناعي', device_image: 'تحليل صورة على الجهاز',
};

export default async function AlertPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await api<AlertDetail>(`/alerts/${id}`);
  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <p className="small"><Link href={`/children/${a.childId}`}>→ العودة</Link></p>
      <div className="row spread">
        <h1>{a.labelAr}</h1>
        <SeverityBadge severity={a.severity} />
      </div>
      <p className="muted small">
        {SOURCE_LABELS[a.source] ?? a.source} · {a.direction === 'incoming' ? 'رسالة واردة' : 'رسالة صادرة من طفلك'} · {formatDate(a.occurredAt)} · {STATUS_LABELS[a.status]}
      </p>

      {a.severity === 'critical' && a.category === 'self_harm' && (
        <div className="card notice-danger">
          <strong>إذا كان طفلك في خطر الآن، اتصل بالطوارئ فوراً.</strong>
          <p className="small" style={{ margin: 0 }}>ابقَ معه، وأبعد عنه أي وسيلة قد يؤذي بها نفسه، واطلب مساعدة مختص في الصحة النفسية.</p>
        </div>
      )}

      <div className="card stack">
        <h3>الرسالة</h3>
        <div className="excerpt">{a.excerpt}</div>
        <p className="muted small">مقتطف حتى 280 حرفاً. لا نحتفظ بالمحادثة كاملة. تمت مشاهدة هذا التنبيه وتسجيل ذلك في سجل التدقيق.</p>
        {a.rationaleAr && <p><strong>لماذا هذا التنبيه:</strong> {a.rationaleAr}</p>}
        <p className="muted small">طريقة الرصد: {DETECTOR_LABELS[a.detector] ?? a.detector}{a.matchedTerms.length > 0 && <> · العبارات: <span>{a.matchedTerms.join('، ')}</span></>}</p>
      </div>

      <div className="card">
        <h3>ماذا أفعل؟</h3>
        <p>{a.parentGuidanceAr}</p>
      </div>

      <div className="card"><AlertActions alertId={a.id} status={a.status} /></div>
    </div>
  );
}

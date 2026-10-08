'use client';

import { useState } from 'react';
import Link from 'next/link';
import { call } from '@/lib/client';
import { ConsentForm } from '@/components/ConsentForm';
import { PairingCode } from '@/components/PairingCode';

type Step = 'details' | 'consent' | 'pair';

export default function NewChildPage() {
  const [step, setStep] = useState<Step>('details');
  const [child, setChild] = useState<{ id: string; displayName: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const year = new Date().getFullYear();

  async function createChild(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const data = new FormData(e.currentTarget);
    try {
      const c = await call<{ id: string; displayName: string }>('POST', '/children', {
        displayName: String(data.get('displayName')),
        birthYear: Number(data.get('birthYear')),
      });
      setChild(c);
      setStep('consent');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const steps: [Step, string][] = [['details', 'بيانات الطفل'], ['consent', 'الموافقة'], ['pair', 'ربط الجهاز']];

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <h1>إضافة طفل</h1>
      <ol className="row small muted" style={{ listStyle: 'none', padding: 0, margin: '0 0 1rem' }}>
        {steps.map(([key, label], i) => (
          <li key={key} style={{ fontWeight: step === key ? 700 : 400, color: step === key ? 'var(--text)' : undefined }}>
            {i + 1}. {label}{i < steps.length - 1 && ' ←'}
          </li>
        ))}
      </ol>

      <div className="card">
        {step === 'details' && (
          <form onSubmit={createChild}>
            <div className="field">
              <label htmlFor="displayName">اسم الطفل (أو اسم مستعار)</label>
              <input id="displayName" name="displayName" required maxLength={40} />
            </div>
            <div className="field">
              <label htmlFor="birthYear">سنة الميلاد</label>
              <select id="birthYear" name="birthYear" required defaultValue={year - 10}>
                {Array.from({ length: 16 }, (_, i) => year - 3 - i).map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <p className="muted small">نحفظ السنة فقط، لا تاريخ الميلاد الكامل.</p>
            </div>
            {error && <p className="error">{error}</p>}
            <button type="submit">التالي</button>
          </form>
        )}
        {step === 'consent' && child && (
          <ConsentForm childId={child.id} childName={child.displayName} onDone={() => setStep('pair')} />
        )}
        {step === 'pair' && child && (
          <div className="stack">
            <h2>ربط جهاز {child.displayName}</h2>
            <PairingCode childId={child.id} />
            <p className="center"><Link href={`/children/${child.id}`}>الانتقال إلى صفحة الطفل ←</Link></p>
          </div>
        )}
      </div>
    </div>
  );
}

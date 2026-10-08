import Link from 'next/link';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/labels';
import type {
  AlertSetting, AlertSummary, Child, Consent, DailyLimit, Device, Geofence, LinkedAccount, LocationInfo, Me, Schedule,
} from '@/lib/types';
import { AlertList } from '@/components/AlertList';
import { PairingCode } from '@/components/PairingCode';
import { DeviceList } from '@/components/child/DeviceList';
import { AlertSettingsForm } from '@/components/child/AlertSettingsForm';
import { SchedulesEditor } from '@/components/child/SchedulesEditor';
import { LimitsEditor } from '@/components/child/LimitsEditor';
import { GeofencesEditor } from '@/components/child/GeofencesEditor';
import { AccountsPanel } from '@/components/child/AccountsPanel';
import { ConsentPanel } from '@/components/child/ConsentPanel';

const TABS = {
  alerts: 'التنبيهات',
  location: 'الموقع',
  screen: 'وقت الشاشة',
  devices: 'الأجهزة',
  accounts: 'الحسابات',
  settings: 'التنبيهات والأماكن',
  consent: 'الموافقة والخصوصية',
} as const;
type Tab = keyof typeof TABS;

function osmEmbed(lat: number, lng: number) {
  const d = 0.006;
  const bbox = [lng - d, lat - d, lng + d, lat + d].join(',');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
}

export default async function ChildPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; status?: string; gmail?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tab: Tab = (sp.tab && sp.tab in TABS ? sp.tab : sp.gmail ? 'accounts' : 'alerts') as Tab;
  const child = await api<Child>(`/children/${id}`);
  const base = `/children/${id}`;

  return (
    <>
      <p className="small"><Link href="/">→ كل الأطفال</Link></p>
      <h1>{child.displayName}</h1>
      <nav className="tabs" aria-label="أقسام">
        {Object.entries(TABS).map(([key, label]) => (
          <Link key={key} href={`${base}?tab=${key}`} className="tab" aria-current={tab === key ? 'page' : undefined}>{label}</Link>
        ))}
      </nav>
      {tab === 'alerts' && <AlertsTab id={id} status={sp.status} />}
      {tab === 'location' && <LocationTab id={id} />}
      {tab === 'screen' && <ScreenTab id={id} />}
      {tab === 'devices' && <DevicesTab id={id} />}
      {tab === 'accounts' && <AccountsTab id={id} status={sp.gmail} />}
      {tab === 'settings' && <SettingsTab id={id} />}
      {tab === 'consent' && <ConsentTab id={id} name={child.displayName} />}
    </>
  );
}

async function AlertsTab({ id, status }: { id: string; status?: string }) {
  const filter = status === 'all' ? '' : `?status=${status ?? 'new'}`;
  const { alerts } = await api<{ alerts: AlertSummary[] }>(`/children/${id}/alerts${filter}`);
  const filters = { new: 'الجديدة', viewed: 'تمت مشاهدتها', resolved: 'المعالجة', all: 'الكل' };
  return (
    <div className="card">
      <div className="row" style={{ marginBottom: '0.5rem' }}>
        {Object.entries(filters).map(([k, v]) => (
          <Link key={k} href={`/children/${id}?tab=alerts&status=${k}`}
                className={`badge ${(status ?? 'new') === k ? 'sev sev-low' : ''}`}>{v}</Link>
        ))}
      </div>
      <AlertList alerts={alerts} />
    </div>
  );
}

async function LocationTab({ id }: { id: string }) {
  const loc = await api<LocationInfo>(`/children/${id}/location`);
  return (
    <>
      <div className="card">
        {loc.latest ? (
          <>
            <iframe className="map" title="آخر موقع" src={osmEmbed(loc.latest.lat, loc.latest.lng)} loading="lazy" />
            <p className="muted small" style={{ marginTop: '0.5rem' }}>
              آخر تحديث: {formatDate(loc.latest.recordedAt)}
              {loc.latest.accuracyM != null && ` · الدقة ±${Math.round(loc.latest.accuracyM)} م`}
              {loc.latest.batteryPct != null && ` · البطارية ${loc.latest.batteryPct}%`}
              {' · '}<a href={`https://www.google.com/maps?q=${loc.latest.lat},${loc.latest.lng}`} target="_blank" rel="noreferrer">فتح في الخرائط</a>
            </p>
          </>
        ) : <p className="muted">لا يوجد موقع بعد. تأكد من ربط الجهاز ومنح إذن الموقع.</p>}
      </div>
      <div className="card">
        <h3>الوصول والمغادرة</h3>
        {loc.recentEvents.length === 0 ? <p className="muted">لا أحداث بعد. أضف أماكن من تبويب «التنبيهات والأماكن».</p> : (
          <ul className="list">
            {loc.recentEvents.map((e, i) => (
              <li key={i}>{e.event === 'enter' ? 'وصول إلى' : 'مغادرة'} <strong>{e.placeName}</strong> <span className="muted small">· {formatDate(e.occurredAt)}</span></li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

async function ScreenTab({ id }: { id: string }) {
  const [{ schedules }, { limits }] = await Promise.all([
    api<{ schedules: Schedule[] }>(`/children/${id}/schedules`),
    api<{ limits: DailyLimit[] }>(`/children/${id}/daily-limits`),
  ]);
  return (
    <>
      <SchedulesEditor childId={id} schedules={schedules} />
      <LimitsEditor childId={id} limits={limits} />
      <p className="muted small">حظر المواقع والفئات (للعائلة كلها أو لطفل محدد) من <Link href="/account#filters">الحساب والإعدادات</Link>.</p>
    </>
  );
}

async function DevicesTab({ id }: { id: string }) {
  const { devices } = await api<{ devices: Device[] }>(`/children/${id}/devices`);
  return (
    <>
      <div className="card"><h3>الأجهزة المرتبطة</h3><DeviceList childId={id} devices={devices} /></div>
      <div className="card"><h3>ربط جهاز جديد</h3><PairingCode childId={id} /></div>
    </>
  );
}

async function AccountsTab({ id, status }: { id: string; status?: string }) {
  const { accounts, gmailAvailable } = await api<{ accounts: LinkedAccount[]; gmailAvailable: boolean }>(`/children/${id}/accounts`);
  return <AccountsPanel childId={id} accounts={accounts} gmailAvailable={gmailAvailable} status={status} />;
}

async function SettingsTab({ id }: { id: string }) {
  const [{ settings }, { geofences }, loc] = await Promise.all([
    api<{ settings: AlertSetting[] }>(`/children/${id}/alert-settings`),
    api<{ geofences: Geofence[] }>(`/children/${id}/geofences`),
    api<LocationInfo>(`/children/${id}/location`),
  ]);
  return (
    <>
      <AlertSettingsForm childId={id} initial={settings} />
      <GeofencesEditor childId={id} geofences={geofences} suggestion={loc.latest} />
    </>
  );
}

async function ConsentTab({ id, name }: { id: string; name: string }) {
  const [{ consents }, me] = await Promise.all([
    api<{ consents: Consent[] }>(`/children/${id}/consents`),
    api<Me>('/auth/me'),
  ]);
  return <ConsentPanel childId={id} childName={name} consents={consents} isOwner={me.role === 'owner'} />;
}

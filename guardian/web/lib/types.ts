export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type AlertStatus = 'new' | 'viewed' | 'resolved' | 'dismissed';

export interface Me {
  id: string; email: string; fullName: string; mfaEnabled: boolean;
  familyId: string; familyName: string; timezone: string; role: 'owner' | 'guardian';
}
export interface Child { id: string; displayName: string; birthYear: number; newAlerts?: number; devices?: number; scopes?: string[] }
export interface AlertSummary {
  id: string; source: string; direction: string; category: string; severity: Severity;
  confidence: number; rationaleAr: string | null; status: AlertStatus; occurredAt: string; createdAt: string;
}
export interface AlertDetail extends AlertSummary {
  childId: string; labelAr: string; parentGuidanceAr: string; detector: string; matchedTerms: string[]; excerpt: string;
}
export interface LocationInfo {
  latest: { lat: number; lng: number; accuracyM: number | null; batteryPct: number | null; recordedAt: string } | null;
  recentEvents: { event: 'enter' | 'exit'; occurredAt: string; placeName: string }[];
}
export interface Device { id: string; platform: string; model: string | null; appVersion: string | null; enrolledAt: string; lastSeenAt: string | null }
export interface Geofence { id: string; name: string; lat: number; lng: number; radiusM: number; notifyEnter: boolean; notifyExit: boolean }
export interface Schedule { id: string; name: string; daysOfWeek: number[]; startsAt: string; endsAt: string; mode: 'block_internet' | 'allowlist_only'; enabled: boolean }
export interface DailyLimit { target: 'app' | 'web_category'; value: string; minutes: number }
export interface AlertSetting { category: string; enabled: boolean; minSeverity: Severity }
export interface LinkedAccount { id: string; provider: string; connectedAt: string; lastSyncedAt: string | null; lastError: string | null; disconnectedAt: string | null }
export interface Consent { id: string; scopes: string[]; method: string; policyVersion: string; grantedAt: string; revokedAt: string | null }
export interface FilterRule { id: string; childId: string | null; target: 'domain' | 'web_category' | 'app'; value: string; action: 'allow' | 'block' }

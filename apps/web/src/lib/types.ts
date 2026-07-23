export type Role = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';

export interface Workspace {
  id: string;
  name: string;
  role: Role;
}

export interface Me {
  user: { id: string; email: string; name?: string };
  workspaces: Workspace[];
}

export interface Member {
  id: string;
  userId: string;
  email: string;
  name?: string | null;
  role: Role;
  mappingIds: string[];
  createdAt: string;
}

export interface Connection {
  id: string;
  type: 'AMOCRM' | 'BITRIX24';
  name: string;
  baseUrl: string;
  status: 'PENDING' | 'ACTIVE' | 'ERROR';
  hasToken: boolean;
  webhookUrl: string;
  amoRedirectUri?: string;
  createdAt: string;
}

export type DestinationKind = 'META' | 'TIKTOK' | 'GOOGLE_ADS' | 'YANDEX';

export interface Destination {
  id: string;
  type: DestinationKind;
  name: string;
  pixelId: string;
  accessTokenMasked: string;
  testEventCode?: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface Mapping {
  id: string;
  entityType: string;
  pipelineId?: string | null;
  pipelineName?: string | null;
  statusId: string;
  statusName?: string | null;
  eventName: string;
  sendValue: boolean;
  currency: string;
  isActive: boolean;
  connection: { id: string; name: string; type: string };
  destination: { id: string; name: string; type: string };
}

export interface DeliveryLog {
  id: string;
  eventName: string;
  crmEntityId?: string | null;
  status: 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';
  attempts: number;
  error?: string | null;
  createdAt: string;
  sentAt?: string | null;
}

export interface DailyPoint {
  date: string;
  sent: number;
  failed: number;
  pending: number;
  skipped: number;
}

export interface Stats {
  period: string;
  deliveries: Record<'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED', number>;
  successRate: number | null;
  connections: number;
  destinations: number;
  mappings: number;
  days: DailyPoint[];
}

export interface StatusOption {
  id: string;
  name: string;
}

export interface PipelineOption {
  id: string;
  name: string;
  statuses: StatusOption[];
}

export interface Pipelines {
  lead: PipelineOption[];
  deal: PipelineOption[];
}

export interface DiagnosticCheck {
  key: string;
  label: string;
  status: 'ok' | 'warn' | 'fail';
  detail: string;
}

export interface BreakdownRow {
  key: string;
  label: string;
  sent: number;
  failed: number;
  pending: number;
  skipped: number;
  total: number;
  successRate: number | null;
}

export interface ErrorRow {
  category: string;
  hint: string;
  count: number;
  lastSeen: string;
  sample: string;
}

export interface FunnelRow {
  eventName: string;
  sent: number;
  total: number;
}

export interface FilterOptions {
  connections: { id: string; name: string; type: string }[];
  destinations: { id: string; name: string; type: string }[];
  eventNames: string[];
}

export interface AdvisorRec {
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  metric?: string;
}

export interface AdvisorData {
  score: number;
  level: 'good' | 'warn' | 'bad';
  summary: string;
  recommendations: AdvisorRec[];
  period: string;
}

export interface TrendPoint {
  date: string;
  sent: number;
  failed: number;
  successRate: number | null;
}

export interface HeatCell {
  dow: number; // 1=Пн .. 7=Вс
  hour: number; // 0..23
  count: number;
}

export interface AnalyticsData {
  period: { days: number };
  overview: {
    total: number;
    sent: number;
    failed: number;
    pending: number;
    skipped: number;
    successRate: number | null;
    prev: { total: number; sent: number; successRate: number | null };
  };
  successTrend: TrendPoint[];
  latency: { avg: number; median: number; p90: number; count: number };
  reliability: { first_try: number; retried: number; failed: number };
  matchQuality: {
    total: number;
    email: number;
    phone: number;
    external_id: number;
    click_id: number;
    none: number;
  };
  value: {
    total: number;
    count: number;
    byCurrency: { currency: string; total: number; count: number }[];
  };
  heatmap: HeatCell[];
  byConnection: BreakdownRow[];
  byMapping: BreakdownRow[];
}

export interface SourceStatus {
  sourceId: string;
  label: string;
  kind: 'pool' | 'distribution';
  configured: boolean;
  ok: boolean;
  stale: boolean;
  lastSuccessAt: string | null;
  message: string;
}

export interface PoolAccountMetrics {
  totalAccounts: number;
  availableAccounts: number;
  unhealthyAccounts: number;
  disabledAccounts: number;
}

export interface PoolUsageMetrics {
  totalRequests: number;
  successRequests: number;
  failedRequests: number;
  totalTokens: number;
  todayRequests: number;
  todayTokens: number;
}

export interface PoolSnapshot {
  id: string;
  label: string;
  managementUrl: string;
  available: boolean;
  accountMetrics: PoolAccountMetrics;
  usageMetrics: PoolUsageMetrics;
  status: SourceStatus;
}

export interface DistributionMetrics {
  todayRequests: number;
  requests24h: number;
  activeUsers24h: number;
  avgRps10m: number;
}

export interface DistributionSnapshot {
  label: string;
  available: boolean;
  metrics: DistributionMetrics;
  status: SourceStatus;
}

export interface SummaryMetrics {
  totalAccounts: number;
  availableAccounts: number;
  unhealthyAccounts: number;
  disabledAccounts: number;
}

export interface DashboardOverview {
  generatedAt: string;
  timezone: string;
  refreshSeconds: number;
  hasAnyData: boolean;
  hasFreshData: boolean;
  hasDegradedSources: boolean;
  summary: SummaryMetrics;
  pools: PoolSnapshot[];
  distribution: DistributionSnapshot;
  sources: SourceStatus[];
  notices: string[];
}

export interface PoolAuthFileRecord {
  status?: string;
  disabled?: boolean;
  unavailable?: boolean;
  next_retry_after?: string | null;
}

export interface PoolUsageRecord {
  total_requests?: number;
  success_count?: number;
  failure_count?: number;
  total_tokens?: number;
  requests_by_day?: Record<string, number>;
  tokens_by_day?: Record<string, number>;
}

export interface Sub2apiUsageLog {
  id: number;
  userId: number;
  createdAt: string;
  ipAddress: string | null;
}

export interface PoolSourceDefinition {
  kind: 'pool';
  id: string;
  label: string;
  baseUrl: string;
  managementKey: string;
  managementUrl: string;
}

export interface DistributionSourceDefinition {
  kind: 'distribution';
  id: string;
  label: string;
  baseUrl: string;
  adminKey: string;
}

export interface DashboardRuntimeConfig {
  timezone: string;
  refreshSeconds: number;
  upstreamTimeoutMs: number;
  pools: PoolSourceDefinition[];
  distribution: DistributionSourceDefinition | null;
  issues: string[];
}

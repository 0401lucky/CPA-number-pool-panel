import type {
  DistributionMetrics,
  PoolAccountMetrics,
  PoolAuthFileRecord,
  PoolSnapshot,
  PoolUsageMetrics,
  PoolUsageRecord,
  Sub2apiUsageLog,
  SummaryMetrics
} from '@/lib/dashboard/types';
import { formatDateKey } from '@/lib/dashboard/time';

export const EMPTY_POOL_ACCOUNT_METRICS: PoolAccountMetrics = {
  totalAccounts: 0,
  availableAccounts: 0,
  unhealthyAccounts: 0,
  disabledAccounts: 0
};

export const EMPTY_POOL_USAGE_METRICS: PoolUsageMetrics = {
  totalRequests: 0,
  successRequests: 0,
  failedRequests: 0,
  totalTokens: 0,
  todayRequests: 0,
  todayTokens: 0
};

export const EMPTY_DISTRIBUTION_METRICS: DistributionMetrics = {
  todayRequests: 0,
  requests24h: 0,
  activeUsers24h: 0,
  avgRps10m: 0
};

function readNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function isFuture(dateLike: string | null | undefined, now: Date): boolean {
  if (!dateLike) {
    return false;
  }
  const parsed = Date.parse(dateLike);
  return Number.isFinite(parsed) && parsed > now.getTime();
}

export function summarizePoolAccounts(
  files: PoolAuthFileRecord[],
  now = new Date()
): PoolAccountMetrics {
  if (!Array.isArray(files) || files.length === 0) {
    return EMPTY_POOL_ACCOUNT_METRICS;
  }

  let disabledAccounts = 0;
  let unhealthyAccounts = 0;

  for (const file of files) {
    const status = String(file.status ?? '').trim().toLowerCase();
    const disabled = Boolean(file.disabled) || status === 'disabled';
    if (disabled) {
      disabledAccounts += 1;
      continue;
    }

    const unhealthy =
      Boolean(file.unavailable) ||
      status === 'error' ||
      status === 'pending' ||
      status === 'refreshing' ||
      isFuture(file.next_retry_after ?? null, now);

    if (unhealthy) {
      unhealthyAccounts += 1;
    }
  }

  const totalAccounts = files.length;
  return {
    totalAccounts,
    disabledAccounts,
    unhealthyAccounts,
    availableAccounts: Math.max(0, totalAccounts - disabledAccounts - unhealthyAccounts)
  };
}

export function summarizePoolUsage(
  usage: PoolUsageRecord,
  timeZone: string,
  now = new Date()
): PoolUsageMetrics {
  const dayKey = formatDateKey(now, timeZone);
  return {
    totalRequests: readNumber(usage.total_requests),
    successRequests: readNumber(usage.success_count),
    failedRequests: readNumber(usage.failure_count),
    totalTokens: readNumber(usage.total_tokens),
    todayRequests: readNumber(usage.requests_by_day?.[dayKey]),
    todayTokens: readNumber(usage.tokens_by_day?.[dayKey])
  };
}

export function summarizeDistribution(
  logs: Sub2apiUsageLog[],
  timeZone: string,
  now = new Date()
): DistributionMetrics {
  if (!Array.isArray(logs) || logs.length === 0) {
    return EMPTY_DISTRIBUTION_METRICS;
  }

  const nowMs = now.getTime();
  const todayKey = formatDateKey(now, timeZone);
  const userIds = new Set<number>();

  let todayRequests = 0;
  let requests24h = 0;
  let requests10m = 0;

  for (const log of logs) {
    const createdAtMs = Date.parse(log.createdAt);
    if (!Number.isFinite(createdAtMs)) {
      continue;
    }

    if (formatDateKey(new Date(createdAtMs), timeZone) === todayKey) {
      todayRequests += 1;
    }

    if (createdAtMs >= nowMs - 24 * 60 * 60 * 1000) {
      requests24h += 1;
      userIds.add(log.userId);
    }

    if (createdAtMs >= nowMs - 10 * 60 * 1000) {
      requests10m += 1;
    }
  }

  return {
    todayRequests,
    requests24h,
    activeUsers24h: userIds.size,
    avgRps10m: Number((requests10m / 600).toFixed(2))
  };
}

export function summarizePoolFleet(pools: PoolSnapshot[]): SummaryMetrics {
  return pools.reduce<SummaryMetrics>(
    (accumulator, pool) => {
      if (!pool.available) {
        return accumulator;
      }

      accumulator.totalAccounts += pool.accountMetrics.totalAccounts;
      accumulator.availableAccounts += pool.accountMetrics.availableAccounts;
      accumulator.unhealthyAccounts += pool.accountMetrics.unhealthyAccounts;
      accumulator.disabledAccounts += pool.accountMetrics.disabledAccounts;
      return accumulator;
    },
    {
      totalAccounts: 0,
      availableAccounts: 0,
      unhealthyAccounts: 0,
      disabledAccounts: 0
    }
  );
}

import {
  EMPTY_DISTRIBUTION_METRICS,
  EMPTY_POOL_ACCOUNT_METRICS,
  EMPTY_POOL_USAGE_METRICS,
  summarizeDistribution,
  summarizePoolAccounts,
  summarizePoolUsage
} from '@/lib/dashboard/transformers';
import { formatDateKey } from '@/lib/dashboard/time';
import type {
  DistributionSourceDefinition,
  DistributionSnapshot,
  PoolAuthFileRecord,
  PoolSnapshot,
  PoolSourceDefinition,
  PoolUsageRecord,
  Sub2apiUsageLog
} from '@/lib/dashboard/types';

function readObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

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

async function fetchJson(url: string, headers: HeadersInit, timeoutMs: number) {
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(timeoutMs),
    cache: 'no-store',
    next: { revalidate: 0 }
  });

  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) {
    const message =
      readText(readObject(parsed).error) || `${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  return parsed;
}

function mapAuthFiles(payload: unknown): PoolAuthFileRecord[] {
  const data = readObject(payload);
  const files = Array.isArray(data.files) ? data.files : [];
  return files.map((item) => {
    const record = readObject(item);
    return {
      status: readText(record.status),
      disabled: Boolean(record.disabled),
      unavailable: Boolean(record.unavailable),
      next_retry_after: readText(record.next_retry_after) || null
    };
  });
}

function mapUsage(payload: unknown): PoolUsageRecord {
  const data = readObject(payload);
  const usage = readObject(data.usage);
  const requestsByDayRaw = readObject(usage.requests_by_day);
  const tokensByDayRaw = readObject(usage.tokens_by_day);

  return {
    total_requests: readNumber(usage.total_requests),
    success_count: readNumber(usage.success_count),
    failure_count: readNumber(usage.failure_count),
    total_tokens: readNumber(usage.total_tokens),
    requests_by_day: Object.fromEntries(
      Object.entries(requestsByDayRaw).map(([key, value]) => [key, readNumber(value)])
    ),
    tokens_by_day: Object.fromEntries(
      Object.entries(tokensByDayRaw).map(([key, value]) => [key, readNumber(value)])
    )
  };
}

function mapSub2apiUsageItems(payload: unknown): {
  items: Sub2apiUsageLog[];
  pages: number;
} {
  const data = readObject(payload);
  const envelopeData = readObject(data.data);
  const items = Array.isArray(envelopeData.items) ? envelopeData.items : [];

  return {
    items: items.map((item) => {
      const record = readObject(item);
      return {
        id: readNumber(record.id),
        userId: readNumber(record.user_id),
        createdAt: readText(record.created_at),
        ipAddress: readText(record.ip_address) || null
      };
    }),
    pages: Math.max(1, readNumber(envelopeData.pages) || 1)
  };
}

function buildPoolHeaders(source: PoolSourceDefinition): HeadersInit {
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${source.managementKey}`
  };
}

function buildSub2apiHeaders(source: DistributionSourceDefinition): HeadersInit {
  return {
    Accept: 'application/json',
    'x-api-key': source.adminKey
  };
}

export async function fetchPoolSnapshot(
  source: PoolSourceDefinition,
  timeZone: string,
  timeoutMs: number
): Promise<PoolSnapshot> {
  const headers = buildPoolHeaders(source);
  const [authFilesPayload, usagePayload] = await Promise.all([
    fetchJson(`${source.baseUrl}/v0/management/auth-files`, headers, timeoutMs),
    fetchJson(`${source.baseUrl}/v0/management/usage`, headers, timeoutMs)
  ]);

  return {
    id: source.id,
    label: source.label,
    managementUrl: source.managementUrl,
    available: true,
    accountMetrics: summarizePoolAccounts(mapAuthFiles(authFilesPayload)),
    usageMetrics: summarizePoolUsage(mapUsage(usagePayload), timeZone),
    status: {
      sourceId: source.id,
      label: source.label,
      kind: 'pool',
      configured: true,
      ok: true,
      stale: false,
      lastSuccessAt: null,
      message: '实时拉取成功'
    }
  };
}

async function fetchSub2apiUsagePage(
  source: DistributionSourceDefinition,
  timeoutMs: number,
  page: number,
  pageSize: number,
  startDate: string,
  endDate: string
) {
  const query = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
    start_date: startDate,
    end_date: endDate,
    timezone: 'UTC',
    exact_total: 'true'
  });

  return fetchJson(
    `${source.baseUrl}/api/v1/admin/usage?${query.toString()}`,
    buildSub2apiHeaders(source),
    timeoutMs
  );
}

export async function fetchDistributionSnapshot(
  source: DistributionSourceDefinition,
  timeZone: string,
  timeoutMs: number
): Promise<DistributionSnapshot> {
  const now = new Date();
  const startDate = formatDateKey(new Date(now.getTime() - 24 * 60 * 60 * 1000), timeZone);
  const endDate = formatDateKey(now, timeZone);
  const pageSize = 200;

  const firstPayload = await fetchSub2apiUsagePage(
    source,
    timeoutMs,
    1,
    pageSize,
    startDate,
    endDate
  );
  const firstPage = mapSub2apiUsageItems(firstPayload);
  const followUps =
    firstPage.pages > 1
      ? await Promise.all(
          Array.from({ length: firstPage.pages - 1 }, (_, index) =>
            fetchSub2apiUsagePage(
              source,
              timeoutMs,
              index + 2,
              pageSize,
              startDate,
              endDate
            )
          )
        )
      : [];

  const items = [...firstPage.items];
  for (const payload of followUps) {
    items.push(...mapSub2apiUsageItems(payload).items);
  }

  return {
    label: source.label,
    available: true,
    metrics: summarizeDistribution(items, timeZone),
    status: {
      sourceId: source.id,
      label: source.label,
      kind: 'distribution',
      configured: true,
      ok: true,
      stale: false,
      lastSuccessAt: null,
      message: '实时拉取成功'
    }
  };
}

export function createUnavailablePool(sourceId: string, label: string, message: string): PoolSnapshot {
  return {
    id: sourceId,
    label,
    managementUrl: '#',
    available: false,
    accountMetrics: EMPTY_POOL_ACCOUNT_METRICS,
    usageMetrics: EMPTY_POOL_USAGE_METRICS,
    status: {
      sourceId,
      label,
      kind: 'pool',
      configured: false,
      ok: false,
      stale: false,
      lastSuccessAt: null,
      message
    }
  };
}

export function createUnavailableDistribution(
  label: string,
  message: string
): DistributionSnapshot {
  return {
    label,
    available: false,
    metrics: EMPTY_DISTRIBUTION_METRICS,
    status: {
      sourceId: 'sub2api',
      label,
      kind: 'distribution',
      configured: false,
      ok: false,
      stale: false,
      lastSuccessAt: null,
      message
    }
  };
}

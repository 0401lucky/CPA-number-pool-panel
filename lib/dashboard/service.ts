import { getDashboardRuntimeConfig } from '@/lib/dashboard/env';
import { summarizePoolFleet } from '@/lib/dashboard/transformers';
import {
  createUnavailableDistribution,
  createUnavailablePool,
  fetchDistributionSnapshot,
  fetchPoolSnapshot
} from '@/lib/dashboard/upstream';
import type {
  DashboardOverview,
  DistributionSnapshot,
  DistributionSourceDefinition,
  PoolSnapshot,
  PoolSourceDefinition,
  SourceStatus
} from '@/lib/dashboard/types';

interface CacheEntry<T> {
  snapshot: T;
  lastSuccessAt: string;
}

const sourceCache = new Map<string, CacheEntry<PoolSnapshot | DistributionSnapshot>>();
let aggregateCache: { payload: DashboardOverview; fetchedAt: number } | null = null;
let inflight: Promise<DashboardOverview> | null = null;

function clonePoolSnapshot(snapshot: PoolSnapshot): PoolSnapshot {
  return {
    ...snapshot,
    accountMetrics: { ...snapshot.accountMetrics },
    usageMetrics: { ...snapshot.usageMetrics },
    status: { ...snapshot.status }
  };
}

function cloneDistributionSnapshot(snapshot: DistributionSnapshot): DistributionSnapshot {
  return {
    ...snapshot,
    metrics: { ...snapshot.metrics },
    status: { ...snapshot.status }
  };
}

function clonePayload(payload: DashboardOverview): DashboardOverview {
  return {
    ...payload,
    summary: { ...payload.summary },
    pools: payload.pools.map(clonePoolSnapshot),
    distribution: cloneDistributionSnapshot(payload.distribution),
    sources: payload.sources.map((source) => ({ ...source })),
    notices: [...payload.notices]
  };
}

function updatePoolStatus(
  snapshot: PoolSnapshot,
  updates: Partial<SourceStatus>
): PoolSnapshot {
  return {
    ...snapshot,
    status: {
      ...snapshot.status,
      ...updates
    }
  };
}

function updateDistributionStatus(
  snapshot: DistributionSnapshot,
  updates: Partial<SourceStatus>
): DistributionSnapshot {
  return {
    ...snapshot,
    status: {
      ...snapshot.status,
      ...updates
    }
  };
}

function isCacheEntryReusable(entry: CacheEntry<unknown> | undefined, maxStaleAgeMs: number): boolean {
  if (!entry) {
    return false;
  }

  const lastSuccessAtMs = Date.parse(entry.lastSuccessAt);
  if (!Number.isFinite(lastSuccessAtMs)) {
    return false;
  }

  return Date.now() - lastSuccessAtMs <= maxStaleAgeMs;
}

async function resolvePoolSource(
  source: PoolSourceDefinition,
  timeZone: string,
  timeoutMs: number,
  maxStaleAgeMs: number
): Promise<PoolSnapshot> {
  const cached = sourceCache.get(source.id) as CacheEntry<PoolSnapshot> | undefined;

  try {
    const snapshot = await fetchPoolSnapshot(source, timeZone, timeoutMs);
    const lastSuccessAt = new Date().toISOString();
    const nextSnapshot = updatePoolStatus(snapshot, {
      configured: true,
      ok: true,
      stale: false,
      lastSuccessAt,
      message: '实时拉取成功'
    });
    sourceCache.set(source.id, {
      snapshot: nextSnapshot,
      lastSuccessAt
    });
    return nextSnapshot;
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    if (cached && isCacheEntryReusable(cached, maxStaleAgeMs)) {
      const reusableCache = cached;
      return updatePoolStatus(clonePoolSnapshot(reusableCache.snapshot), {
        configured: true,
        ok: false,
        stale: true,
        lastSuccessAt: reusableCache.lastSuccessAt,
        message: `拉取失败，已回退缓存：${message}`
      });
    }

    if (cached) {
      return {
        ...createUnavailablePool(source.id, source.label, `拉取失败，最近缓存已过期：${message}`),
        managementUrl: source.managementUrl,
        status: {
          sourceId: source.id,
          label: source.label,
          kind: 'pool',
          configured: true,
          ok: false,
          stale: false,
          lastSuccessAt: cached.lastSuccessAt,
          message: `拉取失败，最近缓存已过期：${message}`
        }
      };
    }

    return {
      ...createUnavailablePool(source.id, source.label, `首轮拉取失败：${message}`),
      managementUrl: source.managementUrl,
      status: {
        sourceId: source.id,
        label: source.label,
        kind: 'pool',
        configured: true,
        ok: false,
        stale: false,
        lastSuccessAt: null,
        message: `首轮拉取失败：${message}`
      }
    };
  }
}

async function resolveDistributionSource(
  source: DistributionSourceDefinition,
  timeZone: string,
  timeoutMs: number,
  maxStaleAgeMs: number
): Promise<DistributionSnapshot> {
  const cached = sourceCache.get(source.id) as CacheEntry<DistributionSnapshot> | undefined;

  try {
    const snapshot = await fetchDistributionSnapshot(source, timeZone, timeoutMs);
    const lastSuccessAt = new Date().toISOString();
    const nextSnapshot = updateDistributionStatus(snapshot, {
      configured: true,
      ok: true,
      stale: false,
      lastSuccessAt,
      message: '实时拉取成功'
    });
    sourceCache.set(source.id, {
      snapshot: nextSnapshot,
      lastSuccessAt
    });
    return nextSnapshot;
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    if (cached && isCacheEntryReusable(cached, maxStaleAgeMs)) {
      const reusableCache = cached;
      return updateDistributionStatus(cloneDistributionSnapshot(reusableCache.snapshot), {
        configured: true,
        ok: false,
        stale: true,
        lastSuccessAt: reusableCache.lastSuccessAt,
        message: `拉取失败，已回退缓存：${message}`
      });
    }

    if (cached) {
      return updateDistributionStatus(
        createUnavailableDistribution(source.label, `拉取失败，最近缓存已过期：${message}`),
        {
          configured: true,
          lastSuccessAt: cached.lastSuccessAt
        }
      );
    }

    return updateDistributionStatus(
      createUnavailableDistribution(source.label, `首轮拉取失败：${message}`),
      {
        configured: true
      }
    );
  }
}

async function buildDashboardOverview(): Promise<DashboardOverview> {
  const runtime = getDashboardRuntimeConfig();
  const maxStaleAgeMs = Math.max(runtime.refreshSeconds * 3 * 1000, 30_000);
  const resolvedPools =
    runtime.pools.length > 0
      ? await Promise.all(
          runtime.pools.map((source) =>
            resolvePoolSource(
              source,
              runtime.timezone,
              runtime.upstreamTimeoutMs,
              maxStaleAgeMs
            )
          )
        )
      : [];
  const pools = [...resolvedPools];

  if (!pools.some((pool) => pool.id === 'pool_cli')) {
    pools.push(createUnavailablePool('pool_cli', 'CLI 号池', '等待补充号池配置'));
  }
  if (!pools.some((pool) => pool.id === 'pool_cpa')) {
    pools.push(createUnavailablePool('pool_cpa', 'CPA 号池', '等待补充号池配置'));
  }
  pools.sort((left, right) => left.id.localeCompare(right.id));

  const distribution = runtime.distribution
    ? await resolveDistributionSource(
        runtime.distribution,
        runtime.timezone,
        runtime.upstreamTimeoutMs,
        maxStaleAgeMs
      )
    : createUnavailableDistribution('sub2api 分发', '等待补充 sub2api 配置');

  const sources = [...pools.map((pool) => pool.status), distribution.status];
  const summary = summarizePoolFleet(pools);
  const hasAnyData = pools.some((pool) => pool.available) || distribution.available;
  const configuredSources = sources.filter((source) => source.configured);
  const hasFreshData = configuredSources.some((source) => source.ok && !source.stale);
  const hasDegradedSources = configuredSources.some((source) => source.stale || !source.ok);

  return {
    generatedAt: new Date().toISOString(),
    timezone: runtime.timezone,
    refreshSeconds: runtime.refreshSeconds,
    hasAnyData,
    hasFreshData,
    hasDegradedSources,
    summary,
    pools,
    distribution,
    sources,
    notices: runtime.issues
  };
}

export async function getDashboardOverview(forceRefresh = false): Promise<DashboardOverview> {
  const runtime = getDashboardRuntimeConfig();
  const ttlMs = runtime.refreshSeconds * 1000;

  if (!forceRefresh && aggregateCache && Date.now() - aggregateCache.fetchedAt < ttlMs) {
    return clonePayload(aggregateCache.payload);
  }

  if (inflight) {
    return clonePayload(await inflight);
  }

  inflight = buildDashboardOverview().finally(() => {
    inflight = null;
  });

  const payload = await inflight;
  aggregateCache = {
    payload,
    fetchedAt: Date.now()
  };

  return clonePayload(payload);
}

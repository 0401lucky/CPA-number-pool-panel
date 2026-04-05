import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  DashboardRuntimeConfig,
  PoolSnapshot,
  PoolSourceDefinition
} from '@/lib/dashboard/types';

const poolSource: PoolSourceDefinition = {
  kind: 'pool',
  id: 'pool_cli',
  label: 'CLI 号池',
  baseUrl: 'https://pool.example.com',
  managementKey: 'secret',
  managementUrl: 'https://pool.example.com/management.html#/login'
};

const runtimeConfig: DashboardRuntimeConfig = {
  timezone: 'Asia/Shanghai',
  refreshSeconds: 10,
  upstreamTimeoutMs: 8000,
  pools: [poolSource],
  distribution: null,
  issues: []
};

const poolSnapshot: PoolSnapshot = {
  id: 'pool_cli',
  label: 'CLI 号池',
  managementUrl: poolSource.managementUrl,
  available: true,
  accountMetrics: {
    totalAccounts: 12,
    availableAccounts: 10,
    unhealthyAccounts: 1,
    disabledAccounts: 1
  },
  usageMetrics: {
    totalRequests: 300,
    successRequests: 290,
    failedRequests: 10,
    totalTokens: 9000,
    todayRequests: 40,
    todayTokens: 1200
  },
  status: {
    sourceId: 'pool_cli',
    label: 'CLI 号池',
    kind: 'pool',
    configured: true,
    ok: true,
    stale: false,
    lastSuccessAt: null,
    message: '实时拉取成功'
  }
};

function mockServiceDependencies(fetchPoolSnapshot: ReturnType<typeof vi.fn>) {
  vi.doMock('@/lib/dashboard/env', () => ({
    getDashboardRuntimeConfig: () => runtimeConfig
  }));

  vi.doMock('@/lib/dashboard/upstream', async () => {
    const actual = await vi.importActual<typeof import('@/lib/dashboard/upstream')>(
      '@/lib/dashboard/upstream'
    );

    return {
      ...actual,
      fetchPoolSnapshot,
      fetchDistributionSnapshot: vi.fn()
    };
  });
}

describe('getDashboardOverview', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-05T00:00:00.000Z'));
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('在缓存未过期时回退最近成功快照', async () => {
    const fetchPoolSnapshot = vi
      .fn()
      .mockResolvedValueOnce(poolSnapshot)
      .mockRejectedValueOnce(new Error('The operation was aborted due to timeout'));

    mockServiceDependencies(fetchPoolSnapshot);

    const { getDashboardOverview } = await import('@/lib/dashboard/service');

    await getDashboardOverview(true);
    vi.setSystemTime(new Date('2026-04-05T00:00:15.000Z'));

    const payload = await getDashboardOverview(true);
    const cliPool = payload.pools.find((pool) => pool.id === 'pool_cli');

    expect(cliPool?.available).toBe(true);
    expect(cliPool?.status.stale).toBe(true);
    expect(cliPool?.status.lastSuccessAt).toBe('2026-04-05T00:00:00.000Z');
    expect(cliPool?.status.message).toContain('已回退缓存');
    expect(payload.hasFreshData).toBe(false);
    expect(payload.hasDegradedSources).toBe(true);
  });

  it('在缓存过期后停止继续展示旧快照', async () => {
    const fetchPoolSnapshot = vi
      .fn()
      .mockResolvedValueOnce(poolSnapshot)
      .mockRejectedValueOnce(new Error('The operation was aborted due to timeout'));

    mockServiceDependencies(fetchPoolSnapshot);

    const { getDashboardOverview } = await import('@/lib/dashboard/service');

    await getDashboardOverview(true);
    vi.setSystemTime(new Date('2026-04-05T00:00:31.000Z'));

    const payload = await getDashboardOverview(true);
    const cliPool = payload.pools.find((pool) => pool.id === 'pool_cli');

    expect(cliPool?.available).toBe(false);
    expect(cliPool?.status.stale).toBe(false);
    expect(cliPool?.status.lastSuccessAt).toBe('2026-04-05T00:00:00.000Z');
    expect(cliPool?.status.message).toContain('缓存已过期');
    expect(payload.hasFreshData).toBe(false);
    expect(payload.hasDegradedSources).toBe(true);
  });
});

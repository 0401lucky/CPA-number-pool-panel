import { describe, expect, it } from 'vitest';

import {
  summarizeDistribution,
  summarizePoolAccounts,
  summarizePoolUsage
} from '@/lib/dashboard/transformers';

describe('summarizePoolAccounts', () => {
  it('能正确区分可用、异常和禁用账号', () => {
    const summary = summarizePoolAccounts(
      [
        { status: 'active', disabled: false, unavailable: false },
        { status: 'disabled', disabled: true, unavailable: false },
        {
          status: 'error',
          disabled: false,
          unavailable: true,
          next_retry_after: '2026-03-31T16:00:00.000Z'
        },
        { status: 'refreshing', disabled: false, unavailable: false }
      ],
      new Date('2026-03-31T15:00:00.000Z')
    );

    expect(summary).toEqual({
      totalAccounts: 4,
      availableAccounts: 1,
      unhealthyAccounts: 2,
      disabledAccounts: 1
    });
  });
});

describe('summarizePoolUsage', () => {
  it('按业务时区读取今日请求与今日 token', () => {
    const summary = summarizePoolUsage(
      {
        total_requests: 999,
        success_count: 990,
        failure_count: 9,
        total_tokens: 500000,
        requests_by_day: {
          '2026-03-31': 77
        },
        tokens_by_day: {
          '2026-03-31': 33000
        }
      },
      'Asia/Shanghai',
      new Date('2026-03-31T15:00:00.000Z')
    );

    expect(summary.todayRequests).toBe(77);
    expect(summary.todayTokens).toBe(33000);
    expect(summary.totalRequests).toBe(999);
  });
});

describe('summarizeDistribution', () => {
  it('能按窗口聚合今日请求、24h 活跃用户和 10 分钟均速', () => {
    const summary = summarizeDistribution(
      [
        {
          id: 1,
          userId: 101,
          createdAt: '2026-03-31T14:55:00.000Z',
          ipAddress: '1.1.1.1'
        },
        {
          id: 2,
          userId: 102,
          createdAt: '2026-03-31T06:00:00.000Z',
          ipAddress: '2.2.2.2'
        },
        {
          id: 3,
          userId: 101,
          createdAt: '2026-03-30T20:00:00.000Z',
          ipAddress: '1.1.1.1'
        },
        {
          id: 4,
          userId: 103,
          createdAt: '2026-03-30T12:30:00.000Z',
          ipAddress: '3.3.3.3'
        }
      ],
      'Asia/Shanghai',
      new Date('2026-03-31T15:00:00.000Z')
    );

    expect(summary.todayRequests).toBe(3);
    expect(summary.requests24h).toBe(3);
    expect(summary.activeUsers24h).toBe(2);
    expect(summary.avgRps10m).toBeCloseTo(1 / 600, 2);
  });
});

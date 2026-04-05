import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchDistributionSnapshot } from '@/lib/dashboard/upstream';
import type { DistributionSourceDefinition } from '@/lib/dashboard/types';

const source: DistributionSourceDefinition = {
  kind: 'distribution',
  id: 'sub2api',
  label: 'sub2api 分发',
  baseUrl: 'https://sub2api.example.com',
  adminKey: 'secret'
};

describe('fetchDistributionSnapshot', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-05T16:30:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('请求 sub2api usage 时使用业务时区参数', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              items: [
                {
                  id: 1,
                  user_id: 1001,
                  created_at: '2026-04-05T16:25:00.000Z',
                  ip_address: '1.1.1.1'
                }
              ],
              pages: 2
            }
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              items: [
                {
                  id: 2,
                  user_id: 1002,
                  created_at: '2026-04-05T15:00:00.000Z',
                  ip_address: '2.2.2.2'
                }
              ],
              pages: 2
            }
          }),
          { status: 200 }
        )
      );

    vi.stubGlobal('fetch', fetchMock);

    const snapshot = await fetchDistributionSnapshot(source, 'Asia/Shanghai', 8000);
    const firstRequestUrl = String(fetchMock.mock.calls[0][0]);
    const secondRequestUrl = String(fetchMock.mock.calls[1][0]);

    expect(firstRequestUrl).toContain('timezone=Asia%2FShanghai');
    expect(firstRequestUrl).toContain('start_date=2026-04-05');
    expect(firstRequestUrl).toContain('end_date=2026-04-06');
    expect(secondRequestUrl).toContain('page=2');
    expect(snapshot.metrics.todayRequests).toBe(1);
    expect(snapshot.metrics.requests24h).toBe(2);
    expect(snapshot.metrics.activeUsers24h).toBe(2);
  });
});

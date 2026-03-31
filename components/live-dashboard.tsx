'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';

import { formatDateTime, formatRelativeTime } from '@/lib/dashboard/time';
import type {
  DashboardOverview,
  DistributionSnapshot,
  PoolSnapshot,
  SourceStatus
} from '@/lib/dashboard/types';

function formatNumber(value: number) {
  return new Intl.NumberFormat('zh-CN').format(value);
}

function formatRps(value: number) {
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function statusTone(source: SourceStatus) {
  if (!source.configured) {
    return 'muted';
  }
  if (source.stale) {
    return 'warn';
  }
  if (source.ok) {
    return 'good';
  }
  return 'bad';
}

function MetricCard({
  label,
  value,
  note,
  tone = 'neutral'
}: {
  label: string;
  value: string;
  note: string;
  tone?: 'neutral' | 'good' | 'bad' | 'warn';
}) {
  return (
    <article className={`metric-card metric-${tone}`}>
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      <span className="metric-note">{note}</span>
    </article>
  );
}

function PoolPanel({ pool, timezone }: { pool: PoolSnapshot; timezone: string }) {
  return (
    <section className="panel-block">
      <div className="panel-head">
        <div>
          <p className="panel-eyebrow">实时号池</p>
          <h2>{pool.label}</h2>
        </div>
        <div className="panel-actions">
          <span className={`status-pill ${statusTone(pool.status)}`}>
            {pool.status.stale ? '缓存回退' : pool.status.ok ? '在线' : '离线'}
          </span>
          <a
            href={pool.managementUrl}
            target="_blank"
            rel="noreferrer"
            className="open-link"
          >
            新窗口打开
          </a>
        </div>
      </div>

      <div className="metrics-grid">
        <MetricCard
          label="总账号"
          value={pool.available ? formatNumber(pool.accountMetrics.totalAccounts) : '--'}
          note="已返回的 auth-files 数量"
        />
        <MetricCard
          label="可用账号"
          value={pool.available ? formatNumber(pool.accountMetrics.availableAccounts) : '--'}
          note="可立即参与调度"
          tone="good"
        />
        <MetricCard
          label="异常 / 冷却"
          value={pool.available ? formatNumber(pool.accountMetrics.unhealthyAccounts) : '--'}
          note="error / pending / refreshing / cooldown"
          tone="warn"
        />
        <MetricCard
          label="已禁用"
          value={pool.available ? formatNumber(pool.accountMetrics.disabledAccounts) : '--'}
          note="管理端明确禁用的账号"
          tone="bad"
        />
      </div>

      <div className="usage-strip">
        <MetricCard
          label="累计请求"
          value={pool.available ? formatNumber(pool.usageMetrics.totalRequests) : '--'}
          note="来自 /v0/management/usage"
        />
        <MetricCard
          label="今日请求"
          value={pool.available ? formatNumber(pool.usageMetrics.todayRequests) : '--'}
          note={`按 ${timezone} 展示`}
        />
        <MetricCard
          label="累计 Token"
          value={pool.available ? formatNumber(pool.usageMetrics.totalTokens) : '--'}
          note="服务聚合后的 token 总量"
        />
        <MetricCard
          label="失败请求"
          value={pool.available ? formatNumber(pool.usageMetrics.failedRequests) : '--'}
          note={`成功 ${formatNumber(pool.usageMetrics.successRequests)}`}
        />
      </div>

      <p className="panel-foot">
        {pool.status.message}
        {pool.status.lastSuccessAt
          ? `，最近成功：${formatDateTime(pool.status.lastSuccessAt, timezone)}`
          : ''}
      </p>
    </section>
  );
}

function DistributionPanel({
  distribution,
  timezone
}: {
  distribution: DistributionSnapshot;
  timezone: string;
}) {
  return (
    <section className="panel-block distribution-panel">
      <div className="panel-head">
        <div>
          <p className="panel-eyebrow">分发请求</p>
          <h2>{distribution.label}</h2>
        </div>
        <span className={`status-pill ${statusTone(distribution.status)}`}>
          {distribution.status.stale ? '缓存回退' : distribution.status.ok ? '在线' : '待接入'}
        </span>
      </div>

      <div className="metrics-grid">
        <MetricCard
          label="今日请求"
          value={distribution.available ? formatNumber(distribution.metrics.todayRequests) : '--'}
          note={`按 ${timezone} 统计`}
        />
        <MetricCard
          label="24 小时请求"
          value={distribution.available ? formatNumber(distribution.metrics.requests24h) : '--'}
          note="滚动 24h usage 日志"
        />
        <MetricCard
          label="24 小时活跃用户"
          value={
            distribution.available ? formatNumber(distribution.metrics.activeUsers24h) : '--'
          }
          note="按 userId 去重"
        />
        <MetricCard
          label="10 分钟均速"
          value={distribution.available ? formatRps(distribution.metrics.avgRps10m) : '--'}
          note="最近 10 分钟请求 / 600 秒"
        />
      </div>

      <p className="panel-foot">
        {distribution.status.message}
        {distribution.status.lastSuccessAt
          ? `，最近成功：${formatDateTime(distribution.status.lastSuccessAt, timezone)}`
          : ''}
      </p>
    </section>
  );
}

function SourceRail({ sources, timezone }: { sources: SourceStatus[]; timezone: string }) {
  return (
    <section className="source-rail">
      {sources.map((source) => (
        <article key={source.sourceId} className={`source-card ${statusTone(source)}`}>
          <div className="source-card-head">
            <span>{source.label}</span>
            <span className="source-state">
              {source.stale ? 'stale' : source.ok ? 'fresh' : source.configured ? 'error' : 'idle'}
            </span>
          </div>
          <p>{source.message}</p>
          <span className="source-time">
            {source.lastSuccessAt
              ? `最近成功 ${formatRelativeTime(source.lastSuccessAt)}`
              : `最近成功 ${formatDateTime(source.lastSuccessAt, timezone)}`}
          </span>
        </article>
      ))}
    </section>
  );
}

export function LiveDashboard({ initialData }: { initialData: DashboardOverview }) {
  const [data, setData] = useState(initialData);
  const [countdown, setCountdown] = useState(initialData.refreshSeconds);
  const [banner, setBanner] = useState('');
  const [isPending, startTransition] = useTransition();
  const timerRef = useRef<number | null>(null);
  const refreshRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    setData(initialData);
    setCountdown(initialData.refreshSeconds);
  }, [initialData]);

  const heroCards = useMemo(
    () => [
      {
        label: '总账号',
        value: data.hasAnyData ? formatNumber(data.summary.totalAccounts) : '--',
        note: '两个号池合并后去重前数量'
      },
      {
        label: '可用账号',
        value: data.hasAnyData ? formatNumber(data.summary.availableAccounts) : '--',
        note: '可即时参与调度的账号',
        tone: 'good' as const
      },
      {
        label: '异常 / 冷却',
        value: data.hasAnyData ? formatNumber(data.summary.unhealthyAccounts) : '--',
        note: '临时错误、待刷新、冷却中的账号',
        tone: 'warn' as const
      },
      {
        label: '已禁用',
        value: data.hasAnyData ? formatNumber(data.summary.disabledAccounts) : '--',
        note: '管理端显式停用的账号',
        tone: 'bad' as const
      }
    ],
    [data]
  );

  refreshRef.current = async () => {
    try {
      const response = await fetch('/api/dashboard/overview', {
        cache: 'no-store'
      });
      if (!response.ok) {
        throw new Error(`刷新失败：${response.status}`);
      }
      const payload = (await response.json()) as DashboardOverview;
      startTransition(() => {
        setData(payload);
        setBanner(payload.hasFreshData ? '' : '当前展示的是部分缓存快照。');
      });
      setCountdown(payload.refreshSeconds);
    } catch (error) {
      setBanner(error instanceof Error ? error.message : '刷新失败，继续展示上次结果。');
      setCountdown((current) => (current > 0 ? current : data.refreshSeconds));
    }
  };

  useEffect(() => {
    timerRef.current = window.setInterval(() => {
      setCountdown((current) => {
        if (current <= 1) {
          void refreshRef.current();
          return data.refreshSeconds;
        }
        return current - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
      }
    };
  }, [data.refreshSeconds]);

  return (
    <main className="dashboard-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <section className="hero-panel">
        <div className="hero-copy">
          <p className="hero-kicker">实时聚合看板</p>
          <h1>OPENAI 实时号池</h1>
          <p className="hero-description">
            聚合两个 CLIProxyAPI 号池和 sub2api 请求指标，默认每 {data.refreshSeconds} 秒刷新一次。
          </p>
        </div>

        <div className="hero-side">
          <div className="live-badge">
            <span className={`live-dot ${isPending ? 'pending' : ''}`} />
            {data.hasFreshData ? '实时中' : '缓存中'}
          </div>
          <div className="hero-meta">
            <span>时区：{data.timezone}</span>
            <span>下次刷新：{countdown}s</span>
            <span>生成时间：{formatDateTime(data.generatedAt, data.timezone)}</span>
          </div>
        </div>
      </section>

      {(banner || data.notices.length > 0) && (
        <section className="notice-stack">
          {banner ? <div className="notice-banner">{banner}</div> : null}
          {data.notices.map((notice) => (
            <div key={notice} className="notice-banner muted">
              {notice}
            </div>
          ))}
        </section>
      )}

      <section className="hero-metrics">
        {heroCards.map((item) => (
          <MetricCard
            key={item.label}
            label={item.label}
            value={item.value}
            note={item.note}
            tone={item.tone}
          />
        ))}
      </section>

      <section className="panel-grid">
        {data.pools.map((pool) => (
          <PoolPanel key={pool.id} pool={pool} timezone={data.timezone} />
        ))}
      </section>

      <DistributionPanel distribution={data.distribution} timezone={data.timezone} />

      <section className="footer-band">
        <div>
          <p className="panel-eyebrow">来源健康度</p>
          <h2>上游状态轨道</h2>
        </div>
        <SourceRail sources={data.sources} timezone={data.timezone} />
      </section>
    </main>
  );
}

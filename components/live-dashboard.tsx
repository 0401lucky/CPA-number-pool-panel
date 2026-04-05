'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import {
  ExternalLink,
  Users,
  AlertCircle,
  Ban,
  Activity,
  Zap,
  FileDigit,
  XCircle,
  Clock,
  CheckCircle2,
  Server,
  Globe2,
  LayoutDashboard,
  Database,
  RefreshCcw
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { formatDateTime, formatRelativeTime } from '@/lib/dashboard/time';
import type { DashboardOverview, DistributionSnapshot, PoolSnapshot, SourceStatus } from '@/lib/dashboard/types';

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

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
};

function AnimatedNumber({ value }: { value: string | number }) {
  return (
    <span className="metric-number-stack">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          className="metric-number-layer"
          initial={{ opacity: 0, y: -15, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: 15, filter: 'blur(4px)', position: 'absolute', inset: 0 }}
          transition={{ duration: 0.3 }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function MetricCard({
  label,
  value,
  note,
  tone = 'neutral',
  icon: Icon
}: {
  label: string;
  value: string;
  note: string;
  tone?: 'neutral' | 'good' | 'bad' | 'warn';
  icon?: LucideIcon;
}) {
  const isLongValue = value.length >= 10;

  return (
    <motion.article variants={itemVariants} className={`metric-card metric-${tone}`}>
      <div className="metric-label-container">
        {Icon && <Icon className="metric-label-icon" size={16} />}
        <span className="metric-label">{label}</span>
      </div>
      <strong className={`metric-value${isLongValue ? ' compact' : ''}`}>
        <AnimatedNumber value={value} />
      </strong>
      <span className="metric-note">{note}</span>
    </motion.article>
  );
}

function PoolPanel({ pool, timezone }: { pool: PoolSnapshot; timezone: string }) {
  return (
    <motion.section variants={itemVariants} className="panel-block">
      <div className="panel-head">
        <div>
          <p className="panel-eyebrow">
            <Database size={14} /> 实时号池
          </p>
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
            <ExternalLink size={14} /> 新窗口打开
          </a>
        </div>
      </div>

      <div className="metrics-grid">
        <MetricCard
          label="总账号"
          value={pool.available ? formatNumber(pool.accountMetrics.totalAccounts) : '--'}
          note="已返回的 auth-files 数量"
          icon={Users}
        />
        <MetricCard
          label="可用账号"
          value={pool.available ? formatNumber(pool.accountMetrics.availableAccounts) : '--'}
          note="可立即参与调度"
          tone="good"
          icon={CheckCircle2}
        />
        <MetricCard
          label="异常 / 冷却"
          value={pool.available ? formatNumber(pool.accountMetrics.unhealthyAccounts) : '--'}
          note="error / pending / refreshing"
          tone="warn"
          icon={AlertCircle}
        />
        <MetricCard
          label="已禁用"
          value={pool.available ? formatNumber(pool.accountMetrics.disabledAccounts) : '--'}
          note="管理端明确禁用的账号"
          tone="bad"
          icon={Ban}
        />
      </div>

      <div className="usage-strip">
        <MetricCard
          label="累计请求"
          value={pool.available ? formatNumber(pool.usageMetrics.totalRequests) : '--'}
          note="来自 /v0/management/usage"
          icon={Activity}
        />
        <MetricCard
          label="今日请求"
          value={pool.available ? formatNumber(pool.usageMetrics.todayRequests) : '--'}
          note={`按 ${timezone} 展示`}
          icon={Zap}
        />
        <MetricCard
          label="累计 Token"
          value={pool.available ? formatNumber(pool.usageMetrics.totalTokens) : '--'}
          note="服务聚合后的 token 总量"
          icon={FileDigit}
        />
        <MetricCard
          label="失败请求"
          value={pool.available ? formatNumber(pool.usageMetrics.failedRequests) : '--'}
          note={`成功 ${formatNumber(pool.usageMetrics.successRequests)}`}
          icon={XCircle}
        />
      </div>

      <p className="panel-foot">
        <Clock size={14} />
        {pool.status.message}
        {pool.status.lastSuccessAt
          ? `，同步于 ${formatDateTime(pool.status.lastSuccessAt, timezone)}`
          : ''}
      </p>
    </motion.section>
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
    <motion.section variants={itemVariants} className="panel-block distribution-panel">
      <div className="panel-head">
        <div>
          <p className="panel-eyebrow">
            <Globe2 size={14} /> 分发请求
          </p>
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
          icon={Zap}
        />
        <MetricCard
          label="24小时请求"
          value={distribution.available ? formatNumber(distribution.metrics.requests24h) : '--'}
          note="滚动 24h usage 日志"
          icon={Activity}
        />
        <MetricCard
          label="24小时活跃用户"
          value={
            distribution.available ? formatNumber(distribution.metrics.activeUsers24h) : '--'
          }
          note="按 userId 去重"
          icon={Users}
        />
        <MetricCard
          label="10分钟均速"
          value={distribution.available ? formatRps(distribution.metrics.avgRps10m) : '--'}
          note="最近 10 分钟请求 / 600 秒"
          icon={Server}
        />
      </div>

      <p className="panel-foot">
        <Clock size={14} />
        {distribution.status.message}
        {distribution.status.lastSuccessAt
          ? `，同步于 ${formatDateTime(distribution.status.lastSuccessAt, timezone)}`
          : ''}
      </p>
    </motion.section>
  );
}

function SourceRail({ sources }: { sources: SourceStatus[] }) {
  return (
    <motion.section variants={containerVariants} initial="hidden" animate="show" className="source-rail">
      {sources.map((source) => (
        <motion.article variants={itemVariants} key={source.sourceId} className={`source-card ${statusTone(source)}`}>
          <div className="source-card-head">
            <span>{source.label}</span>
            <span className="source-state">
              {source.stale ? '缓存' : source.ok ? '实时' : source.configured ? '异常' : '待接入'}
            </span>
          </div>
          <p>{source.message}</p>
          <span className="source-time">
            <RefreshCcw size={12} />
            {source.lastSuccessAt
              ? `最近成功 ${formatRelativeTime(source.lastSuccessAt)}`
              : '从未成功'}
          </span>
        </motion.article>
      ))}
    </motion.section>
  );
}

export function LiveDashboard({ initialData }: { initialData: DashboardOverview }) {
  const [data, setData] = useState(initialData);
  const [countdown, setCountdown] = useState(initialData.refreshSeconds);
  const [banner, setBanner] = useState(
    initialData.hasDegradedSources
      ? '部分来源拉取失败，当前混合展示实时数据和缓存快照。'
      : ''
  );
  const [isPending, startTransition] = useTransition();
  const timerRef = useRef<number | null>(null);
  const refreshRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    setData(initialData);
    setCountdown(initialData.refreshSeconds);
    setBanner(
      initialData.hasDegradedSources
        ? '部分来源拉取失败，当前混合展示实时数据和缓存快照。'
        : ''
    );
  }, [initialData]);

  const heroCards = useMemo(
    () => [
      {
        label: '总账号',
        value: data.hasAnyData ? formatNumber(data.summary.totalAccounts) : '--',
        note: '两个号池合并后去重前数量',
        icon: Users
      },
      {
        label: '可用账号',
        value: data.hasAnyData ? formatNumber(data.summary.availableAccounts) : '--',
        note: '可即时参与调度的账号',
        tone: 'good' as const,
        icon: CheckCircle2
      },
      {
        label: '异常 / 冷却',
        value: data.hasAnyData ? formatNumber(data.summary.unhealthyAccounts) : '--',
        note: '临时错误、待刷新、冷却中的账号',
        tone: 'warn' as const,
        icon: AlertCircle
      },
      {
        label: '已禁用',
        value: data.hasAnyData ? formatNumber(data.summary.disabledAccounts) : '--',
        note: '管理端显式停用的账号',
        tone: 'bad' as const,
        icon: Ban
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
        setBanner(
          payload.hasDegradedSources
            ? '部分来源拉取失败，当前混合展示实时数据和缓存快照。'
            : ''
        );
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

      <motion.section 
        className="hero-panel"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <div className="hero-copy">
          <p className="hero-kicker">
            <LayoutDashboard size={16} /> 实时聚合看板
          </p>
          <h1>OPENAI 实时号池</h1>
          <p className="hero-description">
            聚合两个 CLIProxyAPI 号池和 sub2api 请求指标，默认每 {data.refreshSeconds} 秒刷新一次。
          </p>
        </div>

        <div className="hero-side">
          <div className="live-badge">
            <span className={`live-dot ${isPending ? 'pending' : ''}`} />
            {data.hasDegradedSources ? '部分缓存' : data.hasFreshData ? '实时中' : '缓存中'}
          </div>
          <div className="hero-meta">
            <span><Globe2 size={12} /> 时区：{data.timezone}</span>
            <span>
              <motion.div
                animate={{ rotate: isPending ? 360 : 0 }}
                transition={{ repeat: isPending ? Infinity : 0, duration: 1, ease: 'linear' }}
                style={{ display: 'inline-flex', alignItems: 'center' }}
              >
                <RefreshCcw size={12} />
              </motion.div>
              {' '}下次刷新：{countdown}s
            </span>
            <span><Clock size={12} /> 生成时间：{formatDateTime(data.generatedAt, data.timezone)}</span>
          </div>
        </div>
      </motion.section>

      <AnimatePresence>
        {(banner || data.notices.length > 0) && (
          <motion.section 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="notice-stack"
          >
            {banner ? <div className="notice-banner"><AlertCircle size={16}/> {banner}</div> : null}
            {data.notices.map((notice) => (
              <div key={notice} className="notice-banner muted">
                <AlertCircle size={16}/> {notice}
              </div>
            ))}
          </motion.section>
        )}
      </AnimatePresence>

      <motion.section 
        className="hero-metrics"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        {heroCards.map((item) => (
          <MetricCard
            key={item.label}
            label={item.label}
            value={item.value}
            note={item.note}
            tone={item.tone}
            icon={item.icon}
          />
        ))}
      </motion.section>

      <motion.section 
        className="panel-grid"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        {data.pools.map((pool) => (
          <PoolPanel key={pool.id} pool={pool} timezone={data.timezone} />
        ))}
      </motion.section>

      <motion.div variants={containerVariants} initial="hidden" animate="show">
        <DistributionPanel distribution={data.distribution} timezone={data.timezone} />
      </motion.div>

      <motion.section 
        className="footer-band"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.5 }}
      >
        <div>
          <p className="panel-eyebrow">
            <Activity size={16} /> 来源健康度
          </p>
          <h2>上游状态轨道</h2>
        </div>
        <SourceRail sources={data.sources} />
      </motion.section>
    </main>
  );
}

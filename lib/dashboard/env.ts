import { z } from 'zod';

import type {
  DashboardRuntimeConfig,
  DistributionSourceDefinition,
  PoolSourceDefinition
} from '@/lib/dashboard/types';

const urlSchema = z
  .string()
  .trim()
  .url()
  .transform((value) => value.replace(/\/+$/, ''));

const nonEmptySchema = z.string().trim().min(1);
const labelSchema = z.string().trim().min(1).max(40);

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('zh-CN', { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function readEnv(name: string): string {
  return process.env[name]?.trim() ?? '';
}

function buildManagementUrl(baseUrl: string): string {
  return `${baseUrl}/management.html#/login`;
}

function parsePoolSource(prefix: 'POOL_CLI' | 'POOL_CPA', fallbackLabel: string) {
  const label = readEnv(`${prefix}_LABEL`) || fallbackLabel;
  const baseUrl = readEnv(`${prefix}_BASE_URL`);
  const managementKey = readEnv(`${prefix}_MANAGEMENT_KEY`);
  const missing = [
    !baseUrl ? `${prefix}_BASE_URL` : '',
    !managementKey ? `${prefix}_MANAGEMENT_KEY` : ''
  ].filter(Boolean);

  if (!baseUrl && !managementKey) {
    return {
      source: null,
      issues: [`${label} 未配置，将只展示占位状态。`]
    };
  }

  if (missing.length > 0) {
    return {
      source: null,
      issues: [`${label} 缺少配置：${missing.join('、')}。`]
    };
  }

  const parsed = z
    .object({
      label: labelSchema,
      baseUrl: urlSchema,
      managementKey: nonEmptySchema
    })
    .safeParse({
      label,
      baseUrl,
      managementKey
    });

  if (!parsed.success) {
    return {
      source: null,
      issues: [`${label} 配置非法：${parsed.error.issues[0]?.message ?? '未知错误'}。`]
    };
  }

  const source: PoolSourceDefinition = {
    kind: 'pool',
    id: prefix.toLowerCase(),
    label: parsed.data.label,
    baseUrl: parsed.data.baseUrl,
    managementKey: parsed.data.managementKey,
    managementUrl: buildManagementUrl(parsed.data.baseUrl)
  };

  return {
    source,
    issues: []
  };
}

function parseDistributionSource() {
  const label = readEnv('SUB2API_LABEL') || 'sub2api 分发';
  const baseUrl = readEnv('SUB2API_BASE_URL');
  const adminKey = readEnv('SUB2API_ADMIN_API_KEY');
  const missing = [
    !baseUrl ? 'SUB2API_BASE_URL' : '',
    !adminKey ? 'SUB2API_ADMIN_API_KEY' : ''
  ].filter(Boolean);

  if (!baseUrl && !adminKey) {
    return {
      source: null,
      issues: ['sub2api 未配置，分发请求区块将显示为待接入。']
    };
  }

  if (missing.length > 0) {
    return {
      source: null,
      issues: [`sub2api 缺少配置：${missing.join('、')}。`]
    };
  }

  const parsed = z
    .object({
      label: labelSchema,
      baseUrl: urlSchema,
      adminKey: nonEmptySchema
    })
    .safeParse({
      label,
      baseUrl,
      adminKey
    });

  if (!parsed.success) {
    return {
      source: null,
      issues: [`sub2api 配置非法：${parsed.error.issues[0]?.message ?? '未知错误'}。`]
    };
  }

  const source: DistributionSourceDefinition = {
    kind: 'distribution',
    id: 'sub2api',
    label: parsed.data.label,
    baseUrl: parsed.data.baseUrl,
    adminKey: parsed.data.adminKey
  };

  return {
    source,
    issues: []
  };
}

export function getDashboardRuntimeConfig(): DashboardRuntimeConfig {
  const issues: string[] = [];
  const pools: PoolSourceDefinition[] = [];

  const cliPool = parsePoolSource('POOL_CLI', 'CLI 号池');
  const cpaPool = parsePoolSource('POOL_CPA', 'CPA 号池');

  if (cliPool.source) {
    pools.push(cliPool.source);
  }
  if (cpaPool.source) {
    pools.push(cpaPool.source);
  }

  issues.push(...cliPool.issues, ...cpaPool.issues);

  const distribution = parseDistributionSource();
  issues.push(...distribution.issues);

  const timezoneRaw = readEnv('DASHBOARD_TIMEZONE') || 'Asia/Shanghai';
  const timezone = isValidTimeZone(timezoneRaw) ? timezoneRaw : 'Asia/Shanghai';
  if (timezone !== timezoneRaw) {
    issues.push(`时区 ${timezoneRaw} 非法，已回退到 Asia/Shanghai。`);
  }

  const refreshParsed = z.coerce.number().int().min(5).max(120).safeParse(
    readEnv('DASHBOARD_REFRESH_SECONDS') || '10'
  );
  const upstreamTimeoutParsed = z.coerce.number().int().min(1000).max(30000).safeParse(
    readEnv('UPSTREAM_TIMEOUT_MS') || '8000'
  );

  return {
    timezone,
    refreshSeconds: refreshParsed.success ? refreshParsed.data : 10,
    upstreamTimeoutMs: upstreamTimeoutParsed.success ? upstreamTimeoutParsed.data : 8000,
    pools,
    distribution: distribution.source,
    issues
  };
}

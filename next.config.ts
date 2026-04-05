import type { NextConfig } from 'next';

function normalizeFrameAncestor(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (
    trimmed === "'self'" ||
    trimmed === "'none'" ||
    trimmed === '*' ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://')
  ) {
    try {
      return trimmed.startsWith('http://') || trimmed.startsWith('https://')
        ? new URL(trimmed).origin
        : trimmed;
    } catch {
      return trimmed;
    }
  }

  return trimmed;
}

function buildFrameAncestors() {
  const values = new Set<string>(["'self'"]);
  const extraOrigins = [
    process.env.SUB2API_BASE_URL ?? '',
    process.env.DASHBOARD_FRAME_ANCESTORS ?? ''
  ];

  for (const rawValue of extraOrigins) {
    for (const item of rawValue.split(/[,\s]+/)) {
      const normalized = normalizeFrameAncestor(item);
      if (normalized) {
        values.add(normalized);
      }
    }
  }

  return Array.from(values).join(' ');
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: `frame-ancestors ${buildFrameAncestors()};`
          }
        ]
      }
    ];
  }
};

export default nextConfig;

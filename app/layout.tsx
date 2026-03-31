import type { Metadata } from 'next';

import '@/app/globals.css';

export const metadata: Metadata = {
  title: '实时号池统计面板',
  description: '聚合两个 CLIProxyAPI 号池和 sub2api 分发数据的实时仪表盘。'
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

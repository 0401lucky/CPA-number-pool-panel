import { NextResponse } from 'next/server';

import { getDashboardOverview } from '@/lib/dashboard/service';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const payload = await getDashboardOverview(true);
  return NextResponse.json(payload, {
    headers: {
      'Cache-Control': 'no-store'
    }
  });
}

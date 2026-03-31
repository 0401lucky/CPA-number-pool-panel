import { LiveDashboard } from '@/components/live-dashboard';
import { getDashboardOverview } from '@/lib/dashboard/service';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function HomePage() {
  const initialData = await getDashboardOverview();
  return <LiveDashboard initialData={initialData} />;
}

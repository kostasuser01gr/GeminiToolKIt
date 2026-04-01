import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAppStore } from '../store/appStore';
import { BarChart3, Users, Car, Droplets, AlertTriangle, ClipboardList, TrendingUp, Clock } from 'lucide-react';

interface DashboardData {
  shifts: { total_today: number; coverage_pct: number; open_swaps: number };
  cases: { open: number; critical: number; avg_resolution_hours: number };
  washers: { queue_size: number; completed_today: number; avg_duration_min: number };
  fleet: { total_vehicles: number; available: number; utilization_pct: number };
  recent_audit: Array<{ action: string; entity_type: string; created_at: string; staff_name: string }>;
}

function StatCard({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
        <div className={`p-2.5 rounded-lg ${color}`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const { currentStationId } = useAppStore();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const params = currentStationId ? `?station_id=${currentStationId}` : '';
        const res = await api.get(`/dashboard/overview${params}`);
        setData(res);
      } catch { /* leave as null */ }
      setLoading(false);
    };
    load();
  }, [currentStationId]);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div>;
  }

  if (!data) {
    return (
      <div className="text-center py-16 text-gray-500">
        <BarChart3 className="h-12 w-12 mx-auto mb-4 text-gray-300" />
        <p className="font-medium">No data available yet</p>
        <p className="text-sm mt-1">Start adding staff, vehicles, and schedules to see metrics.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Real-time overview of all fleet operations</p>
      </div>

      {/* Top KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Shifts Today" value={data.shifts.total_today}
          sub={`${data.shifts.coverage_pct}% coverage`} color="bg-blue-500" />
        <StatCard icon={AlertTriangle} label="Open Cases" value={data.cases.open}
          sub={`${data.cases.critical} critical`} color="bg-red-500" />
        <StatCard icon={Droplets} label="Wash Queue" value={data.washers.queue_size}
          sub={`${data.washers.completed_today} done today`} color="bg-teal-500" />
        <StatCard icon={Car} label="Fleet Utilization" value={`${data.fleet.utilization_pct}%`}
          sub={`${data.fleet.available} of ${data.fleet.total_vehicles} available`} color="bg-purple-500" />
      </div>

      {/* Secondary metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={ClipboardList} label="Open Shift Swaps" value={data.shifts.open_swaps} color="bg-amber-500" />
        <StatCard icon={TrendingUp} label="Avg Wash Duration" value={`${data.washers.avg_duration_min} min`} color="bg-cyan-500" />
        <StatCard icon={Clock} label="Avg Case Resolution" value={`${data.cases.avg_resolution_hours}h`} color="bg-indigo-500" />
      </div>

      {/* Recent activity */}
      <div className="bg-white rounded-xl shadow-sm border">
        <div className="p-5 border-b">
          <h2 className="font-semibold text-gray-900">Recent Activity</h2>
        </div>
        <div className="divide-y">
          {data.recent_audit.length === 0 && (
            <p className="p-5 text-gray-400 text-sm text-center">No recent activity</p>
          )}
          {data.recent_audit.map((entry, i) => (
            <div key={i} className="px-5 py-3 flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-gray-800">{entry.staff_name}</span>
                <span className="text-sm text-gray-500 ml-2">{entry.action} {entry.entity_type}</span>
              </div>
              <span className="text-xs text-gray-400">{new Date(entry.created_at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAppStore } from '../store/appStore';
import { Droplets, Play, CheckCircle, Trophy, Plus, Clock } from 'lucide-react';

interface WashEvent {
  id: string; vehicle_id: string; plate: string; wash_type: string;
  status: string; assigned_to: string; washer_name: string;
  started_at: string | null; completed_at: string | null; notes: string;
}
interface LeaderEntry { staff_name: string; washes: number; avg_duration: number }
interface WashStats { total_today: number; avg_duration: number; by_type: Record<string, number> }

const WASH_TYPES = ['exterior', 'interior', 'full', 'express'];

export function WashersPage() {
  const { currentStationId } = useAppStore();
  const [queue, setQueue] = useState<WashEvent[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderEntry[]>([]);
  const [stats, setStats] = useState<WashStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'queue' | 'leaderboard'>('queue');
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ vehicleId: '', washType: 'full', notes: '' });

  useEffect(() => { loadAll(); }, [currentStationId]);

  async function loadAll() {
    setLoading(true);
    try {
      const params = currentStationId ? `?station_id=${currentStationId}` : '';
      const [q, lb, st] = await Promise.all([
        api.get(`/washers/queue${params}`),
        api.get(`/washers/leaderboard${params}`),
        api.get(`/washers/stats${params}`),
      ]);
      setQueue(q.queue || []);
      setLeaderboard(lb.leaderboard || []);
      setStats(st);
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function handleStart(id: string) {
    try { await api.patch(`/washers/${id}/start`, {}); await loadAll(); } catch {}
  }
  async function handleComplete(id: string) {
    try { await api.patch(`/washers/${id}/complete`, {}); await loadAll(); } catch {}
  }
  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post('/washers/queue', { vehicle_id: addForm.vehicleId, wash_type: addForm.washType, notes: addForm.notes, station_id: currentStationId });
      setShowAdd(false);
      setAddForm({ vehicleId: '', washType: 'full', notes: '' });
      await loadAll();
    } catch {}
  }

  const statusColor: Record<string, string> = {
    queued: 'bg-gray-100 text-gray-700',
    in_progress: 'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Wash Operations</h1>
          <p className="text-gray-500 text-sm">Manage vehicle wash queue and track performance</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-1 px-3 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700">
          <Plus className="h-4 w-4" /> Add to Queue
        </button>
      </div>

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-lg border p-4">
            <p className="text-xs text-gray-500">Today</p>
            <p className="text-xl font-bold">{stats.total_today}</p>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <p className="text-xs text-gray-500">Avg Duration</p>
            <p className="text-xl font-bold">{stats.avg_duration} min</p>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <p className="text-xs text-gray-500">In Queue</p>
            <p className="text-xl font-bold">{queue.filter(w => w.status === 'queued').length}</p>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <p className="text-xs text-gray-500">In Progress</p>
            <p className="text-xl font-bold">{queue.filter(w => w.status === 'in_progress').length}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        <button onClick={() => setTab('queue')} className={`px-3 py-1.5 rounded text-sm font-medium ${tab === 'queue' ? 'bg-white shadow text-brand-700' : 'text-gray-500'}`}>
          <Droplets className="h-4 w-4 inline mr-1" /> Queue
        </button>
        <button onClick={() => setTab('leaderboard')} className={`px-3 py-1.5 rounded text-sm font-medium ${tab === 'leaderboard' ? 'bg-white shadow text-brand-700' : 'text-gray-500'}`}>
          <Trophy className="h-4 w-4 inline mr-1" /> Leaderboard
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div>
      ) : tab === 'queue' ? (
        <div className="space-y-3">
          {queue.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <Droplets className="h-10 w-10 mx-auto mb-3 text-gray-300" />
              <p className="font-medium">Queue is empty</p>
              <p className="text-sm">Add vehicles to the wash queue to get started.</p>
            </div>
          )}
          {queue.map(w => (
            <div key={w.id} className="bg-white rounded-lg border p-4 flex items-center justify-between hover:shadow-sm transition-shadow">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-teal-50 flex items-center justify-center">
                  <Droplets className="h-5 w-5 text-teal-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-800">{w.plate}</p>
                  <p className="text-xs text-gray-500">{w.wash_type} wash · {w.washer_name || 'Unassigned'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor[w.status] || ''}`}>{w.status.replace('_', ' ')}</span>
                {w.status === 'queued' && (
                  <button onClick={() => handleStart(w.id)} className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100" title="Start"><Play className="h-4 w-4" /></button>
                )}
                {w.status === 'in_progress' && (
                  <button onClick={() => handleComplete(w.id)} className="p-1.5 bg-green-50 text-green-600 rounded-lg hover:bg-green-100" title="Complete"><CheckCircle className="h-4 w-4" /></button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3 text-xs font-medium text-gray-500">Rank</th>
                <th className="text-left p-3 text-xs font-medium text-gray-500">Washer</th>
                <th className="text-right p-3 text-xs font-medium text-gray-500">Washes</th>
                <th className="text-right p-3 text-xs font-medium text-gray-500">Avg Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {leaderboard.map((entry, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="p-3">
                    {i === 0 ? <span className="text-yellow-500 font-bold">🥇</span> :
                     i === 1 ? <span className="text-gray-400 font-bold">🥈</span> :
                     i === 2 ? <span className="text-orange-400 font-bold">🥉</span> :
                     <span className="text-gray-400 text-sm">{i + 1}</span>}
                  </td>
                  <td className="p-3 font-medium text-sm">{entry.staff_name}</td>
                  <td className="p-3 text-right text-sm">{entry.washes}</td>
                  <td className="p-3 text-right text-sm text-gray-500">{entry.avg_duration} min</td>
                </tr>
              ))}
              {leaderboard.length === 0 && (
                <tr><td colSpan={4} className="p-6 text-center text-gray-400 text-sm">No wash data yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <form onSubmit={handleAdd} className="bg-white rounded-xl p-6 max-w-sm w-full space-y-3">
            <h3 className="font-semibold text-lg">Add to Wash Queue</h3>
            <input required placeholder="Vehicle ID" value={addForm.vehicleId}
              onChange={e => setAddForm(f => ({ ...f, vehicleId: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
            <select value={addForm.washType} onChange={e => setAddForm(f => ({ ...f, washType: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm">
              {WASH_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <textarea placeholder="Notes (optional)" value={addForm.notes}
              onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} />
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setShowAdd(false)} className="flex-1 py-2 border rounded-lg text-sm">Cancel</button>
              <button type="submit" className="flex-1 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700">Add</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

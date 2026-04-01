import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAppStore } from '../store/appStore';
import { AlertTriangle, Plus, Search, Filter } from 'lucide-react';

interface Case {
  id: string; title: string; status: string; priority: string; category: string;
  vehicle_id: string | null; plate: string | null; assigned_to: string | null;
  assignee_name: string | null; created_at: string; updated_at: string;
}

const STATUSES = ['open', 'triaged', 'in_progress', 'awaiting_parts', 'resolved', 'closed', 'escalated'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const CATEGORIES = ['damage', 'mechanical', 'cleaning', 'customer_complaint', 'accident', 'theft', 'other'];

export function CasesPage() {
  const navigate = useNavigate();
  const { currentStationId } = useAppStore();
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ title: '', category: 'damage', priority: 'medium', description: '', vehicleId: '' });

  useEffect(() => { loadCases(); }, [currentStationId, filterStatus, filterPriority]);

  async function loadCases() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (currentStationId) params.set('station_id', currentStationId);
      if (filterStatus) params.set('status', filterStatus);
      if (filterPriority) params.set('priority', filterPriority);
      const res = await api.get(`/cases?${params}`);
      setCases(res.cases || []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await api.post('/cases', {
        title: createForm.title, category: createForm.category, priority: createForm.priority,
        description: createForm.description, vehicle_id: createForm.vehicleId || undefined,
        station_id: currentStationId,
      });
      setShowCreate(false);
      setCreateForm({ title: '', category: 'damage', priority: 'medium', description: '', vehicleId: '' });
      navigate(`/cases/${res.id}`);
    } catch { /* ignore */ }
  }

  const filtered = cases.filter(c =>
    !search || c.title.toLowerCase().includes(search.toLowerCase()) || (c.plate || '').toLowerCase().includes(search.toLowerCase())
  );

  const priorityColor: Record<string, string> = {
    low: 'bg-gray-100 text-gray-700', medium: 'bg-blue-100 text-blue-700',
    high: 'bg-orange-100 text-orange-700', critical: 'bg-red-100 text-red-700',
  };
  const statusColor: Record<string, string> = {
    open: 'bg-yellow-100 text-yellow-700', triaged: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-indigo-100 text-indigo-700', awaiting_parts: 'bg-purple-100 text-purple-700',
    resolved: 'bg-green-100 text-green-700', closed: 'bg-gray-100 text-gray-600',
    escalated: 'bg-red-100 text-red-700',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cases</h1>
          <p className="text-gray-500 text-sm">{cases.length} total cases</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-1 px-3 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700">
          <Plus className="h-4 w-4" /> New Case
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search cases..."
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">All Priorities</option>
          {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* Cases list */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <AlertTriangle className="h-10 w-10 mx-auto mb-3 text-gray-300" />
          <p className="font-medium">No cases found</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3 text-xs font-medium text-gray-500">Title</th>
                <th className="text-left p-3 text-xs font-medium text-gray-500">Category</th>
                <th className="text-left p-3 text-xs font-medium text-gray-500">Priority</th>
                <th className="text-left p-3 text-xs font-medium text-gray-500">Status</th>
                <th className="text-left p-3 text-xs font-medium text-gray-500">Vehicle</th>
                <th className="text-left p-3 text-xs font-medium text-gray-500">Assigned</th>
                <th className="text-right p-3 text-xs font-medium text-gray-500">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(c => (
                <tr key={c.id} onClick={() => navigate(`/cases/${c.id}`)} className="hover:bg-gray-50 cursor-pointer">
                  <td className="p-3 text-sm font-medium text-gray-800">{c.title}</td>
                  <td className="p-3 text-sm text-gray-600">{c.category}</td>
                  <td className="p-3"><span className={`text-xs px-2 py-1 rounded-full font-medium ${priorityColor[c.priority] || ''}`}>{c.priority}</span></td>
                  <td className="p-3"><span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor[c.status] || ''}`}>{c.status.replace('_', ' ')}</span></td>
                  <td className="p-3 text-sm text-gray-600">{c.plate || '—'}</td>
                  <td className="p-3 text-sm text-gray-600">{c.assignee_name || 'Unassigned'}</td>
                  <td className="p-3 text-xs text-gray-400 text-right">{new Date(c.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <form onSubmit={handleCreate} className="bg-white rounded-xl p-6 max-w-md w-full space-y-3">
            <h3 className="font-semibold text-lg">New Case</h3>
            <input required placeholder="Title" value={createForm.title}
              onChange={e => setCreateForm(f => ({ ...f, title: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <select value={createForm.category} onChange={e => setCreateForm(f => ({ ...f, category: e.target.value }))}
                className="border rounded-lg px-3 py-2 text-sm">
                {CATEGORIES.map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
              </select>
              <select value={createForm.priority} onChange={e => setCreateForm(f => ({ ...f, priority: e.target.value }))}
                className="border rounded-lg px-3 py-2 text-sm">
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <input placeholder="Vehicle ID (optional)" value={createForm.vehicleId}
              onChange={e => setCreateForm(f => ({ ...f, vehicleId: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
            <textarea required placeholder="Description" value={createForm.description}
              onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm" rows={3} />
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setShowCreate(false)} className="flex-1 py-2 border rounded-lg text-sm">Cancel</button>
              <button type="submit" className="flex-1 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700">Create</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

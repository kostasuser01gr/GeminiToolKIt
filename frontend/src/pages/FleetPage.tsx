import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAppStore } from '../store/appStore';
import { Car, Plus, Search, Key, ArrowRightLeft } from 'lucide-react';

interface Vehicle {
  id: string; plate: string; make: string; model: string; year: number;
  color: string; category: string; status: string; mileage: number;
  station_id: string; vin: string;
}
interface Handoff {
  id: string; vehicle_id: string; plate: string; from_name: string; to_name: string;
  handoff_type: string; status: string; created_at: string;
}

const CATEGORIES = ['economy', 'compact', 'midsize', 'fullsize', 'suv', 'luxury', 'van', 'truck'];
const V_STATUSES = ['available', 'rented', 'maintenance', 'cleaning', 'transit', 'retired'];

export function FleetPage() {
  const { currentStationId } = useAppStore();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [tab, setTab] = useState<'vehicles' | 'handoffs'>('vehicles');
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({
    plate: '', make: '', model: '', year: new Date().getFullYear(),
    color: '', category: 'compact', vin: '', mileage: 0,
  });

  useEffect(() => { loadAll(); }, [currentStationId, filterStatus]);

  async function loadAll() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (currentStationId) params.set('station_id', currentStationId);
      if (filterStatus) params.set('status', filterStatus);
      const [vRes, hRes] = await Promise.all([
        api.get(`/fleet?${params}`),
        api.get(`/fleet/handoffs?${currentStationId ? `station_id=${currentStationId}` : ''}`),
      ]);
      setVehicles(vRes.vehicles || []);
      setHandoffs(hRes.handoffs || []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post('/fleet', { ...addForm, station_id: currentStationId });
      setShowAdd(false);
      setAddForm({ plate: '', make: '', model: '', year: new Date().getFullYear(), color: '', category: 'compact', vin: '', mileage: 0 });
      await loadAll();
    } catch { /* ignore */ }
  }

  async function updateVehicleStatus(id: string, status: string) {
    try {
      await api.patch(`/fleet/${id}`, { status });
      await loadAll();
    } catch { /* ignore */ }
  }

  const filtered = vehicles.filter(v =>
    !search || v.plate.toLowerCase().includes(search.toLowerCase()) ||
    `${v.make} ${v.model}`.toLowerCase().includes(search.toLowerCase())
  );

  const statusColor: Record<string, string> = {
    available: 'bg-green-100 text-green-700', rented: 'bg-blue-100 text-blue-700',
    maintenance: 'bg-orange-100 text-orange-700', cleaning: 'bg-teal-100 text-teal-700',
    transit: 'bg-purple-100 text-purple-700', retired: 'bg-gray-100 text-gray-600',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fleet Management</h1>
          <p className="text-gray-500 text-sm">{vehicles.length} vehicles</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-1 px-3 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700">
          <Plus className="h-4 w-4" /> Add Vehicle
        </button>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(
          vehicles.reduce((acc, v) => { acc[v.status] = (acc[v.status] || 0) + 1; return acc; }, {} as Record<string, number>)
        ).map(([status, count]) => (
          <button key={status} onClick={() => setFilterStatus(filterStatus === status ? '' : status)}
            className={`text-xs px-3 py-1.5 rounded-full font-medium border ${filterStatus === status ? 'ring-2 ring-brand-400' : ''} ${statusColor[status] || 'bg-gray-50'}`}>
            {status}: {count}
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        <button onClick={() => setTab('vehicles')} className={`px-3 py-1.5 rounded text-sm font-medium ${tab === 'vehicles' ? 'bg-white shadow text-brand-700' : 'text-gray-500'}`}>
          <Car className="h-4 w-4 inline mr-1" /> Vehicles
        </button>
        <button onClick={() => setTab('handoffs')} className={`px-3 py-1.5 rounded text-sm font-medium ${tab === 'handoffs' ? 'bg-white shadow text-brand-700' : 'text-gray-500'}`}>
          <Key className="h-4 w-4 inline mr-1" /> Key Handoffs
        </button>
      </div>

      {/* Search */}
      {tab === 'vehicles' && (
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by plate, make, or model..."
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm" />
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div>
      ) : tab === 'vehicles' ? (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3 text-xs font-medium text-gray-500">Plate</th>
                <th className="text-left p-3 text-xs font-medium text-gray-500">Vehicle</th>
                <th className="text-left p-3 text-xs font-medium text-gray-500">Category</th>
                <th className="text-left p-3 text-xs font-medium text-gray-500">Status</th>
                <th className="text-right p-3 text-xs font-medium text-gray-500">Mileage</th>
                <th className="p-3 text-xs font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-gray-400 text-sm">No vehicles found</td></tr>
              )}
              {filtered.map(v => (
                <tr key={v.id} className="hover:bg-gray-50">
                  <td className="p-3 text-sm font-mono font-medium">{v.plate}</td>
                  <td className="p-3 text-sm">{v.year} {v.make} {v.model} <span className="text-gray-400">({v.color})</span></td>
                  <td className="p-3 text-sm capitalize">{v.category}</td>
                  <td className="p-3"><span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor[v.status] || ''}`}>{v.status}</span></td>
                  <td className="p-3 text-sm text-right text-gray-600">{v.mileage.toLocaleString()} km</td>
                  <td className="p-3">
                    <select value={v.status} onChange={e => updateVehicleStatus(v.id, e.target.value)}
                      className="text-xs border rounded px-2 py-1">
                      {V_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-xl border divide-y">
          {handoffs.length === 0 && <p className="p-6 text-center text-sm text-gray-400">No key handoffs recorded</p>}
          {handoffs.map(h => (
            <div key={h.id} className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded bg-purple-50 flex items-center justify-center"><ArrowRightLeft className="h-4 w-4 text-purple-600" /></div>
                <div>
                  <p className="text-sm font-medium">{h.plate} · {h.handoff_type}</p>
                  <p className="text-xs text-gray-500">{h.from_name} → {h.to_name}</p>
                </div>
              </div>
              <div className="text-right">
                <span className={`text-xs px-2 py-1 rounded-full ${h.status === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{h.status}</span>
                <p className="text-xs text-gray-400 mt-1">{new Date(h.created_at).toLocaleString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add vehicle modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <form onSubmit={handleAdd} className="bg-white rounded-xl p-6 max-w-md w-full space-y-3">
            <h3 className="font-semibold text-lg">Add Vehicle</h3>
            <div className="grid grid-cols-2 gap-2">
              <input required placeholder="Plate" value={addForm.plate} onChange={e => setAddForm(f => ({ ...f, plate: e.target.value }))} className="border rounded-lg px-3 py-2 text-sm" />
              <input placeholder="VIN" value={addForm.vin} onChange={e => setAddForm(f => ({ ...f, vin: e.target.value }))} className="border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input required placeholder="Make" value={addForm.make} onChange={e => setAddForm(f => ({ ...f, make: e.target.value }))} className="border rounded-lg px-3 py-2 text-sm" />
              <input required placeholder="Model" value={addForm.model} onChange={e => setAddForm(f => ({ ...f, model: e.target.value }))} className="border rounded-lg px-3 py-2 text-sm" />
              <input type="number" placeholder="Year" value={addForm.year} onChange={e => setAddForm(f => ({ ...f, year: +e.target.value }))} className="border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input placeholder="Color" value={addForm.color} onChange={e => setAddForm(f => ({ ...f, color: e.target.value }))} className="border rounded-lg px-3 py-2 text-sm" />
              <select value={addForm.category} onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))} className="border rounded-lg px-3 py-2 text-sm">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <input type="number" placeholder="Mileage (km)" value={addForm.mileage} onChange={e => setAddForm(f => ({ ...f, mileage: +e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setShowAdd(false)} className="flex-1 py-2 border rounded-lg text-sm">Cancel</button>
              <button type="submit" className="flex-1 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700">Add Vehicle</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

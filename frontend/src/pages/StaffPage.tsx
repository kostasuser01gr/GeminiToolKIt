import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAppStore } from '../store/appStore';
import { Users, Plus, CalendarOff, Check, X } from 'lucide-react';

interface StaffMember {
  id: string; name: string; email: string; role: string;
  station_id: string; phone: string; status: string;
  max_hours_per_week: number; created_at: string;
}
interface LeaveRequest {
  id: string; staff_id: string; staff_name: string; leave_type: string;
  start_date: string; end_date: string; status: string; reason: string;
}

const ROLES = ['counter', 'delivery', 'wash', 'mechanic', 'manager', 'admin'];

export function StaffPage() {
  const { currentStationId } = useAppStore();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'staff' | 'leave'>('staff');
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({
    name: '', email: '', password: '', role: 'counter', phone: '', maxHours: 40,
  });

  useEffect(() => { loadAll(); }, [currentStationId]);

  async function loadAll() {
    setLoading(true);
    try {
      const params = currentStationId ? `?station_id=${currentStationId}` : '';
      const [sRes, lRes] = await Promise.all([
        api.get(`/staff${params}`),
        api.get(`/staff/leave${params}`),
      ]);
      setStaff(sRes.staff || []);
      setLeaves(lRes.requests || []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post('/staff', {
        name: addForm.name, email: addForm.email, password: addForm.password,
        role: addForm.role, phone: addForm.phone,
        max_hours_per_week: addForm.maxHours, station_id: currentStationId,
      });
      setShowAdd(false);
      setAddForm({ name: '', email: '', password: '', role: 'counter', phone: '', maxHours: 40 });
      await loadAll();
    } catch { /* ignore */ }
  }

  async function handleLeaveAction(id: string, action: 'approve' | 'reject') {
    try {
      await api.patch(`/staff/leave/${id}/${action}`, {});
      await loadAll();
    } catch { /* ignore */ }
  }

  const roleColor: Record<string, string> = {
    admin: 'bg-red-100 text-red-700', manager: 'bg-purple-100 text-purple-700',
    counter: 'bg-blue-100 text-blue-700', delivery: 'bg-green-100 text-green-700',
    wash: 'bg-teal-100 text-teal-700', mechanic: 'bg-orange-100 text-orange-700',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Staff Management</h1>
          <p className="text-gray-500 text-sm">{staff.length} team members</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-1 px-3 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700">
          <Plus className="h-4 w-4" /> Add Staff
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        <button onClick={() => setTab('staff')} className={`px-3 py-1.5 rounded text-sm font-medium ${tab === 'staff' ? 'bg-white shadow text-brand-700' : 'text-gray-500'}`}>
          <Users className="h-4 w-4 inline mr-1" /> Team
        </button>
        <button onClick={() => setTab('leave')} className={`px-3 py-1.5 rounded text-sm font-medium ${tab === 'leave' ? 'bg-white shadow text-brand-700' : 'text-gray-500'}`}>
          <CalendarOff className="h-4 w-4 inline mr-1" /> Leave ({leaves.filter(l => l.status === 'pending').length})
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div>
      ) : tab === 'staff' ? (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3 text-xs font-medium text-gray-500">Name</th>
                <th className="text-left p-3 text-xs font-medium text-gray-500">Email</th>
                <th className="text-left p-3 text-xs font-medium text-gray-500">Role</th>
                <th className="text-left p-3 text-xs font-medium text-gray-500">Phone</th>
                <th className="text-right p-3 text-xs font-medium text-gray-500">Max Hours/Week</th>
                <th className="text-right p-3 text-xs font-medium text-gray-500">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {staff.length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-gray-400 text-sm">No staff members</td></tr>
              )}
              {staff.map(s => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="p-3 text-sm font-medium text-gray-800">{s.name}</td>
                  <td className="p-3 text-sm text-gray-600">{s.email}</td>
                  <td className="p-3"><span className={`text-xs px-2 py-1 rounded-full font-medium ${roleColor[s.role] || 'bg-gray-100'}`}>{s.role}</span></td>
                  <td className="p-3 text-sm text-gray-600">{s.phone || '—'}</td>
                  <td className="p-3 text-sm text-right text-gray-600">{s.max_hours_per_week}h</td>
                  <td className="p-3 text-xs text-gray-400 text-right">{new Date(s.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-xl border divide-y">
          {leaves.length === 0 && <p className="p-6 text-center text-sm text-gray-400">No leave requests</p>}
          {leaves.map(l => (
            <div key={l.id} className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{l.staff_name}</p>
                <p className="text-xs text-gray-500">{l.leave_type} · {l.start_date} to {l.end_date}</p>
                {l.reason && <p className="text-xs text-gray-400 mt-0.5">{l.reason}</p>}
              </div>
              <div className="flex items-center gap-2">
                {l.status === 'pending' ? (
                  <>
                    <button onClick={() => handleLeaveAction(l.id, 'approve')} className="p-1.5 bg-green-50 text-green-600 rounded-lg hover:bg-green-100" title="Approve"><Check className="h-4 w-4" /></button>
                    <button onClick={() => handleLeaveAction(l.id, 'reject')} className="p-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100" title="Reject"><X className="h-4 w-4" /></button>
                  </>
                ) : (
                  <span className={`text-xs px-2 py-1 rounded-full ${l.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{l.status}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add staff modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <form onSubmit={handleAdd} className="bg-white rounded-xl p-6 max-w-sm w-full space-y-3">
            <h3 className="font-semibold text-lg">Add Staff Member</h3>
            <input required placeholder="Full Name" value={addForm.name}
              onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
            <input type="email" required placeholder="Email" value={addForm.email}
              onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
            <input type="password" required placeholder="Password (min 8)" minLength={8} value={addForm.password}
              onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <select value={addForm.role} onChange={e => setAddForm(f => ({ ...f, role: e.target.value }))}
                className="border rounded-lg px-3 py-2 text-sm">
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <input placeholder="Phone" value={addForm.phone}
                onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))}
                className="border rounded-lg px-3 py-2 text-sm" />
            </div>
            <input type="number" placeholder="Max hours/week" value={addForm.maxHours}
              onChange={e => setAddForm(f => ({ ...f, maxHours: +e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
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

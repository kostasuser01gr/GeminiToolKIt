import { useEffect, useState, useMemo } from 'react';
import { api } from '../api/client';
import { useAppStore } from '../store/appStore';
import { Calendar, ChevronLeft, ChevronRight, Plus, RefreshCw, Send, UserCheck, ArrowLeftRight } from 'lucide-react';
import { format, addDays, startOfWeek, parseISO } from 'date-fns';

interface Schedule {
  id: string; week_start: string; status: string; created_at: string;
}
interface Shift {
  id: string; staff_id: string; staff_name: string; date: string;
  start_time: string; end_time: string; role: string; schedule_id: string;
}
interface StaffMember {
  id: string; name: string; role: string; email: string;
}

const HOURS = Array.from({ length: 16 }, (_, i) => i + 6); // 06:00-21:00
const ROLES = ['counter', 'delivery', 'wash', 'mechanic', 'manager'];

export function ShiftsPage() {
  const { currentStationId } = useAppStore();
  const [weekOffset, setWeekOffset] = useState(0);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [activeSchedule, setActiveSchedule] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignForm, setAssignForm] = useState({ staffId: '', date: '', startTime: '08:00', endTime: '16:00', role: 'counter' });
  const [tab, setTab] = useState<'calendar' | 'swaps'>('calendar');
  const [swaps, setSwaps] = useState<any[]>([]);

  const weekStart = useMemo(() => {
    const now = new Date();
    const monday = startOfWeek(now, { weekStartsOn: 1 });
    return addDays(monday, weekOffset * 7);
  }, [weekOffset]);

  const weekDays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
  [weekStart]);

  const weekStr = format(weekStart, 'yyyy-MM-dd');

  useEffect(() => {
    loadData();
  }, [currentStationId, weekStr]);

  async function loadData() {
    setLoading(true);
    try {
      const params = currentStationId ? `&station_id=${currentStationId}` : '';
      const [schedRes, staffRes] = await Promise.all([
        api.get(`/shifts/schedules?week_start=${weekStr}${params}`),
        api.get(`/staff?${params.replace('&', '')}`),
      ]);
      setSchedules(schedRes.schedules || []);
      setStaff(staffRes.staff || []);
      const sched = (schedRes.schedules || [])[0] || null;
      setActiveSchedule(sched);
      if (sched) {
        const shiftRes = await api.get(`/shifts/schedules/${sched.id}`);
        setShifts(shiftRes.shifts || []);
      } else {
        setShifts([]);
      }
      const swapRes = await api.get(`/shifts/swaps?week_start=${weekStr}`);
      setSwaps(swapRes.swaps || []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function handleGenerate() {
    if (!currentStationId) return;
    setGenerating(true);
    try {
      await api.post('/shifts/generate', { station_id: currentStationId, week_start: weekStr });
      await loadData();
    } catch { /* ignore */ }
    setGenerating(false);
  }

  async function handleStatusChange(newStatus: string) {
    if (!activeSchedule) return;
    try {
      await api.patch(`/shifts/schedules/${activeSchedule.id}/status`, { status: newStatus });
      await loadData();
    } catch { /* ignore */ }
  }

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!activeSchedule) return;
    try {
      await api.put(`/shifts/schedules/${activeSchedule.id}/assign`, {
        staff_id: assignForm.staffId, date: assignForm.date,
        start_time: assignForm.startTime, end_time: assignForm.endTime, role: assignForm.role,
      });
      setShowAssignModal(false);
      await loadData();
    } catch { /* ignore */ }
  }

  function shiftsForDayStaff(day: Date, staffId: string) {
    const d = format(day, 'yyyy-MM-dd');
    return shifts.filter(s => s.date === d && s.staff_id === staffId);
  }

  const statusColors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700', review: 'bg-yellow-100 text-yellow-700',
    approved: 'bg-blue-100 text-blue-700', published: 'bg-green-100 text-green-700',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Shifts & Scheduling</h1>
          <p className="text-gray-500 text-sm">Week of {format(weekStart, 'MMM d, yyyy')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekOffset(w => w - 1)} className="p-2 border rounded-lg hover:bg-gray-50"><ChevronLeft className="h-4 w-4" /></button>
          <button onClick={() => setWeekOffset(0)} className="px-3 py-2 text-sm border rounded-lg hover:bg-gray-50">Today</button>
          <button onClick={() => setWeekOffset(w => w + 1)} className="p-2 border rounded-lg hover:bg-gray-50"><ChevronRight className="h-4 w-4" /></button>
          <button onClick={handleGenerate} disabled={generating || !currentStationId}
            className="flex items-center gap-1 px-3 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${generating ? 'animate-spin' : ''}`} /> Generate
          </button>
        </div>
      </div>

      {/* Schedule status bar */}
      {activeSchedule && (
        <div className="flex items-center gap-3 bg-white p-3 rounded-lg border">
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[activeSchedule.status] || ''}`}>
            {activeSchedule.status}
          </span>
          <span className="text-sm text-gray-500">{shifts.length} shifts assigned</span>
          <div className="ml-auto flex gap-2">
            {activeSchedule.status === 'draft' && (
              <button onClick={() => handleStatusChange('review')} className="text-xs px-3 py-1.5 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600">Submit for Review</button>
            )}
            {activeSchedule.status === 'review' && (
              <button onClick={() => handleStatusChange('approved')} className="text-xs px-3 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600">Approve</button>
            )}
            {activeSchedule.status === 'approved' && (
              <button onClick={() => handleStatusChange('published')} className="text-xs px-3 py-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center gap-1"><Send className="h-3 w-3" /> Publish</button>
            )}
            <button onClick={() => { setAssignForm(f => ({ ...f, date: format(weekDays[0], 'yyyy-MM-dd') })); setShowAssignModal(true); }}
              className="text-xs px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-1"><Plus className="h-3 w-3" /> Add Shift</button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        <button onClick={() => setTab('calendar')} className={`px-3 py-1.5 rounded text-sm font-medium ${tab === 'calendar' ? 'bg-white shadow text-brand-700' : 'text-gray-500'}`}>
          <Calendar className="h-4 w-4 inline mr-1" /> Calendar
        </button>
        <button onClick={() => setTab('swaps')} className={`px-3 py-1.5 rounded text-sm font-medium ${tab === 'swaps' ? 'bg-white shadow text-brand-700' : 'text-gray-500'}`}>
          <ArrowLeftRight className="h-4 w-4 inline mr-1" /> Swaps ({swaps.length})
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div>
      ) : tab === 'calendar' ? (
        /* Weekly Calendar Grid */
        <div className="bg-white rounded-xl border overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="w-32 p-3 text-left text-xs font-medium text-gray-500">Staff</th>
                {weekDays.map(d => (
                  <th key={d.toISOString()} className="p-3 text-center text-xs font-medium text-gray-500">
                    <div>{format(d, 'EEE')}</div>
                    <div className="text-gray-400">{format(d, 'MMM d')}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {staff.length === 0 && (
                <tr><td colSpan={8} className="text-center py-8 text-gray-400 text-sm">No staff members found. Add staff first.</td></tr>
              )}
              {staff.map(s => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="p-3">
                    <div className="text-sm font-medium text-gray-800">{s.name}</div>
                    <div className="text-xs text-gray-400">{s.role}</div>
                  </td>
                  {weekDays.map(d => {
                    const dayShifts = shiftsForDayStaff(d, s.id);
                    return (
                      <td key={d.toISOString()} className="p-2 align-top">
                        {dayShifts.map(sh => (
                          <div key={sh.id} className="text-xs bg-brand-50 text-brand-700 rounded px-1.5 py-1 mb-1 border border-brand-100">
                            {sh.start_time}–{sh.end_time}
                            <div className="text-brand-500">{sh.role}</div>
                          </div>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* Swaps Tab */
        <div className="bg-white rounded-xl border divide-y">
          {swaps.length === 0 && (
            <p className="p-6 text-center text-sm text-gray-400">No pending swap requests</p>
          )}
          {swaps.map((sw: any) => (
            <div key={sw.id} className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{sw.requester_name} → {sw.target_name || 'Open'}</p>
                <p className="text-xs text-gray-500">{sw.shift_date} · {sw.reason}</p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full ${sw.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : sw.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                {sw.status}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Assign modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <form onSubmit={handleAssign} className="bg-white rounded-xl p-6 max-w-sm w-full space-y-3">
            <h3 className="font-semibold text-lg">Add Shift</h3>
            <select required value={assignForm.staffId} onChange={e => setAssignForm(f => ({ ...f, staffId: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">Select staff</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input type="date" required value={assignForm.date} onChange={e => setAssignForm(f => ({ ...f, date: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <input type="time" value={assignForm.startTime} onChange={e => setAssignForm(f => ({ ...f, startTime: e.target.value }))}
                className="border rounded-lg px-3 py-2 text-sm" />
              <input type="time" value={assignForm.endTime} onChange={e => setAssignForm(f => ({ ...f, endTime: e.target.value }))}
                className="border rounded-lg px-3 py-2 text-sm" />
            </div>
            <select value={assignForm.role} onChange={e => setAssignForm(f => ({ ...f, role: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm">
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setShowAssignModal(false)} className="flex-1 py-2 border rounded-lg text-sm">Cancel</button>
              <button type="submit" className="flex-1 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700">Assign</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

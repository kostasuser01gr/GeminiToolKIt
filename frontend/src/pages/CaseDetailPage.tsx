import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { ArrowLeft, Send, StickyNote, UserCheck, Clock } from 'lucide-react';

interface CaseDetail {
  id: string; title: string; description: string; status: string; priority: string;
  category: string; vehicle_id: string | null; plate: string | null;
  assigned_to: string | null; assignee_name: string | null; station_id: string;
  created_by: string; reporter_name: string; created_at: string; updated_at: string;
}
interface Message { id: string; sender_name: string; body: string; created_at: string; is_internal: boolean }
interface Note { id: string; author_name: string; body: string; created_at: string }

const STATUS_FLOW = ['open', 'triaged', 'in_progress', 'awaiting_parts', 'resolved', 'closed', 'escalated'];

export function CaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [caseData, setCaseData] = useState<CaseDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [msgText, setMsgText] = useState('');
  const [noteText, setNoteText] = useState('');
  const [tab, setTab] = useState<'messages' | 'notes'>('messages');
  const [sending, setSending] = useState(false);
  const [staff, setStaff] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => { if (id) load(); }, [id]);

  async function load() {
    setLoading(true);
    try {
      const [res, staffRes] = await Promise.all([
        api.get(`/cases/${id}`),
        api.get('/staff'),
      ]);
      setCaseData(res.case);
      setMessages(res.messages || []);
      setNotes(res.notes || []);
      setStaff(staffRes.staff || []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!msgText.trim()) return;
    setSending(true);
    try {
      await api.post(`/cases/${id}/messages`, { body: msgText });
      setMsgText('');
      await load();
    } catch { /* ignore */ }
    setSending(false);
  }

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteText.trim()) return;
    setSending(true);
    try {
      await api.post(`/cases/${id}/notes`, { body: noteText });
      setNoteText('');
      await load();
    } catch { /* ignore */ }
    setSending(false);
  }

  async function changeStatus(newStatus: string) {
    try {
      await api.patch(`/cases/${id}/status`, { status: newStatus });
      await load();
    } catch { /* ignore */ }
  }

  async function assignTo(staffId: string) {
    try {
      await api.patch(`/cases/${id}/assign`, { staff_id: staffId });
      await load();
    } catch { /* ignore */ }
  }

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div>;
  if (!caseData) return <div className="text-center py-12 text-gray-400">Case not found</div>;

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
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/cases')} className="p-2 border rounded-lg hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">{caseData.title}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor[caseData.status] || ''}`}>{caseData.status.replace('_', ' ')}</span>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${priorityColor[caseData.priority] || ''}`}>{caseData.priority}</span>
            <span className="text-xs text-gray-400">{caseData.category} · {caseData.plate || 'No vehicle'}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-4">
          {/* Description */}
          <div className="bg-white rounded-xl border p-4">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Description</h3>
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{caseData.description || 'No description'}</p>
          </div>

          {/* Messages / Notes tabs */}
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="flex border-b">
              <button onClick={() => setTab('messages')}
                className={`flex-1 py-3 text-sm font-medium ${tab === 'messages' ? 'text-brand-700 border-b-2 border-brand-600' : 'text-gray-500'}`}>
                Messages ({messages.length})
              </button>
              <button onClick={() => setTab('notes')}
                className={`flex-1 py-3 text-sm font-medium ${tab === 'notes' ? 'text-brand-700 border-b-2 border-brand-600' : 'text-gray-500'}`}>
                Internal Notes ({notes.length})
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto p-4 space-y-3">
              {tab === 'messages' ? (
                messages.length === 0 ? <p className="text-sm text-gray-400 text-center py-4">No messages yet</p> :
                messages.map(m => (
                  <div key={m.id} className={`p-3 rounded-lg ${m.sender_name === user?.name ? 'bg-brand-50 ml-8' : 'bg-gray-50 mr-8'}`}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-medium text-gray-700">{m.sender_name}</span>
                      <span className="text-xs text-gray-400">{new Date(m.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-sm text-gray-800">{m.body}</p>
                  </div>
                ))
              ) : (
                notes.length === 0 ? <p className="text-sm text-gray-400 text-center py-4">No internal notes</p> :
                notes.map(n => (
                  <div key={n.id} className="p-3 rounded-lg bg-amber-50 border border-amber-100">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-medium text-amber-800">{n.author_name}</span>
                      <span className="text-xs text-gray-400">{new Date(n.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-sm text-gray-800">{n.body}</p>
                  </div>
                ))
              )}
            </div>

            {/* Input */}
            {tab === 'messages' ? (
              <form onSubmit={sendMessage} className="p-3 border-t flex gap-2">
                <input value={msgText} onChange={e => setMsgText(e.target.value)} placeholder="Type a message..."
                  className="flex-1 px-3 py-2 border rounded-lg text-sm" />
                <button type="submit" disabled={sending || !msgText.trim()}
                  className="px-3 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
                  <Send className="h-4 w-4" />
                </button>
              </form>
            ) : (
              <form onSubmit={addNote} className="p-3 border-t flex gap-2">
                <input value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Add internal note..."
                  className="flex-1 px-3 py-2 border rounded-lg text-sm" />
                <button type="submit" disabled={sending || !noteText.trim()}
                  className="px-3 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50">
                  <StickyNote className="h-4 w-4" />
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Status actions */}
          <div className="bg-white rounded-xl border p-4 space-y-3">
            <h3 className="text-sm font-medium text-gray-500">Actions</h3>
            <div className="space-y-2">
              {STATUS_FLOW.filter(s => s !== caseData.status).map(s => (
                <button key={s} onClick={() => changeStatus(s)}
                  className="w-full text-left px-3 py-2 text-sm border rounded-lg hover:bg-gray-50 capitalize">
                  → {s.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* Assignment */}
          <div className="bg-white rounded-xl border p-4 space-y-3">
            <h3 className="text-sm font-medium text-gray-500 flex items-center gap-1"><UserCheck className="h-4 w-4" /> Assigned To</h3>
            <select value={caseData.assigned_to || ''} onChange={e => assignTo(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">Unassigned</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          {/* Details */}
          <div className="bg-white rounded-xl border p-4 space-y-2">
            <h3 className="text-sm font-medium text-gray-500">Details</h3>
            <div className="text-xs space-y-1">
              <div className="flex justify-between"><span className="text-gray-500">Reporter</span><span>{caseData.reporter_name}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Created</span><span>{new Date(caseData.created_at).toLocaleDateString()}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Updated</span><span>{new Date(caseData.updated_at).toLocaleDateString()}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Vehicle</span><span>{caseData.plate || '—'}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

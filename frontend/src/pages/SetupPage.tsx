import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { Car, CheckCircle } from 'lucide-react';

export function SetupPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    tenantName: '', tenantSlug: '', stationName: '', stationCode: '',
    adminEmail: '', adminPassword: '', adminName: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const update = (field: string, value: string) => setForm(f => ({ ...f, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/setup', form);
      setDone(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-brand-900 to-gray-900 px-4">
        <div className="bg-white rounded-xl shadow-xl p-8 max-w-md w-full text-center">
          <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Setup Complete!</h2>
          <p className="text-gray-600 mb-6">Your organization is ready. You can now sign in.</p>
          <button onClick={() => navigate('/login')} className="px-6 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700">
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-brand-900 to-gray-900 px-4 py-8">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-xl bg-brand-600 mb-4">
            <Car className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Set Up Your Organization</h1>
          <p className="text-gray-400 mt-1">Initialize GeminiToolKit for your fleet</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-xl p-8 space-y-4">
          {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{error}</div>}

          <h3 className="font-semibold text-gray-800 border-b pb-2">Organization</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
              <input required value={form.tenantName} onChange={e => update('tenantName', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">URL Slug</label>
              <input required value={form.tenantSlug} onChange={e => update('tenantSlug', e.target.value)}
                placeholder="my-company" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" />
            </div>
          </div>

          <h3 className="font-semibold text-gray-800 border-b pb-2 pt-2">First Station</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Station Code</label>
              <input required value={form.stationCode} onChange={e => update('stationCode', e.target.value)}
                placeholder="HQ" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Station Name</label>
              <input value={form.stationName} onChange={e => update('stationName', e.target.value)}
                placeholder="Headquarters" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" />
            </div>
          </div>

          <h3 className="font-semibold text-gray-800 border-b pb-2 pt-2">Admin Account</h3>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input required value={form.adminName} onChange={e => update('adminName', e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" required value={form.adminEmail} onChange={e => update('adminEmail', e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password (min 8 chars)</label>
            <input type="password" required minLength={8} value={form.adminPassword} onChange={e => update('adminPassword', e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" />
          </div>

          <button type="submit" disabled={loading}
            className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-medium disabled:opacity-50 mt-2">
            {loading ? 'Setting up...' : 'Initialize Platform'}
          </button>
        </form>
      </div>
    </div>
  );
}

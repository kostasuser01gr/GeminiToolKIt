import { Hono } from 'hono';
import type { Env, AuthContext } from '../env';
import { authMiddleware, requireRole } from '../middleware';
import { generateId, hashPassword } from '../utils';

const staff = new Hono<{ Bindings: Env; Variables: { auth: AuthContext } }>();
staff.use('*', authMiddleware());

// GET /api/staff — list all staff
staff.get('/', async (c) => {
  const auth = c.get('auth');
  const stationId = c.req.query('stationId');

  let sql = `SELECT id, email, display_name, role, station_id, skills, contract_type, max_weekly_hours, is_active, last_login_at, created_at
     FROM staff WHERE tenant_id = ?`;
  const params: any[] = [auth.tenantId];

  if (stationId) { sql += ' AND station_id = ?'; params.push(stationId); }
  sql += ' ORDER BY display_name';

  const rows = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({
    staff: rows.results.map((s: any) => ({ ...s, skills: JSON.parse(s.skills || '[]') })),
  });
});

// POST /api/staff — create new staff member
staff.post('/', requireRole('super_admin', 'station_manager'), async (c) => {
  const auth = c.get('auth');
  const body = await c.req.json<{
    email: string; displayName: string; password: string;
    role?: string; stationId?: string; skills?: string[];
    contractType?: string; maxWeeklyHours?: number; phone?: string;
  }>();

  if (!body.email || !body.displayName || !body.password) {
    return c.json({ error: 'Email, name, and password required' }, 400);
  }
  if (body.password.length < 8) {
    return c.json({ error: 'Password must be at least 8 characters' }, 400);
  }

  const existing = await c.env.DB.prepare(
    'SELECT id FROM staff WHERE tenant_id = ? AND email = ?'
  ).bind(auth.tenantId, body.email.toLowerCase().trim()).first();
  if (existing) return c.json({ error: 'Email already exists' }, 409);

  const id = generateId();
  const passHash = await hashPassword(body.password);

  await c.env.DB.prepare(
    `INSERT INTO staff (id, tenant_id, email, display_name, password_hash, role, station_id, skills, contract_type, max_weekly_hours, phone)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, auth.tenantId, body.email.toLowerCase().trim(), body.displayName, passHash,
    body.role || 'staff', body.stationId || auth.staff.station_id,
    JSON.stringify(body.skills || []), body.contractType || 'full_time',
    body.maxWeeklyHours || 40, body.phone || null
  ).run();

  return c.json({ id }, 201);
});

// PATCH /api/staff/:id — update staff
staff.patch('/:id', requireRole('super_admin', 'station_manager'), async (c) => {
  const auth = c.get('auth');
  const body = await c.req.json<Record<string, any>>();

  const allowed = ['display_name', 'role', 'station_id', 'skills', 'contract_type', 'max_weekly_hours', 'phone', 'is_active'];
  const sets: string[] = ["updated_at = datetime('now')"];
  const vals: any[] = [];

  for (const [key, val] of Object.entries(body)) {
    const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    if (allowed.includes(dbKey)) {
      sets.push(`${dbKey} = ?`);
      vals.push(dbKey === 'skills' ? JSON.stringify(val) : val);
    }
  }
  if (vals.length === 0) return c.json({ error: 'No valid fields' }, 400);

  vals.push(c.req.param('id'), auth.tenantId);
  await c.env.DB.prepare(
    `UPDATE staff SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`
  ).bind(...vals).run();

  return c.json({ ok: true });
});

// GET /api/staff/leave — list leave requests
staff.get('/leave', async (c) => {
  const auth = c.get('auth');
  const status = c.req.query('status');
  let sql = `SELECT l.*, s.display_name as staff_name FROM leave_requests l JOIN staff s ON l.staff_id = s.id WHERE l.tenant_id = ?`;
  const params: any[] = [auth.tenantId];
  if (status) { sql += ' AND l.status = ?'; params.push(status); }
  sql += ' ORDER BY l.start_date DESC LIMIT 100';

  const rows = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ leave: rows.results });
});

// POST /api/staff/leave — request leave
staff.post('/leave', async (c) => {
  const auth = c.get('auth');
  const body = await c.req.json<{ startDate: string; endDate: string; leaveType?: string; reason?: string }>();

  if (!body.startDate || !body.endDate) return c.json({ error: 'Start and end date required' }, 400);

  const id = generateId();
  await c.env.DB.prepare(
    `INSERT INTO leave_requests (id, tenant_id, staff_id, start_date, end_date, leave_type, reason) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, auth.tenantId, auth.staff.id, body.startDate, body.endDate, body.leaveType || 'annual', body.reason || null).run();

  return c.json({ id, status: 'pending' }, 201);
});

// PATCH /api/staff/leave/:id — approve/reject leave
staff.patch('/leave/:id', requireRole('super_admin', 'station_manager', 'supervisor'), async (c) => {
  const auth = c.get('auth');
  const body = await c.req.json<{ status: 'approved' | 'rejected' }>();
  if (!['approved', 'rejected'].includes(body.status)) return c.json({ error: 'Invalid status' }, 400);

  await c.env.DB.prepare(
    `UPDATE leave_requests SET status = ?, approved_by = ? WHERE id = ? AND tenant_id = ?`
  ).bind(body.status, auth.staff.id, c.req.param('id'), auth.tenantId).run();

  return c.json({ ok: true });
});

export default staff;

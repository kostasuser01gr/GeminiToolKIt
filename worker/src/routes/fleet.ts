import { Hono } from 'hono';
import type { Env, AuthContext } from '../env';
import { authMiddleware, requireRole } from '../middleware';
import { generateId } from '../utils';

const fleet = new Hono<{ Bindings: Env; Variables: { auth: AuthContext } }>();
fleet.use('*', authMiddleware());

// GET /api/fleet/vehicles?stationId=X&status=X
fleet.get('/vehicles', async (c) => {
  const auth = c.get('auth');
  const stationId = c.req.query('stationId');
  const status = c.req.query('status');
  const limit = Math.min(parseInt(c.req.query('limit') || '100'), 500);

  let sql = 'SELECT * FROM vehicles WHERE tenant_id = ?';
  const params: any[] = [auth.tenantId];

  if (stationId) { sql += ' AND station_id = ?'; params.push(stationId); }
  if (status) { sql += ' AND status = ?'; params.push(status); }

  sql += ' ORDER BY plate LIMIT ?';
  params.push(limit);

  const rows = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ vehicles: rows.results });
});

// POST /api/fleet/vehicles — add a vehicle
fleet.post('/vehicles', requireRole('super_admin', 'station_manager'), async (c) => {
  const auth = c.get('auth');
  const body = await c.req.json<{
    plate: string; make?: string; model?: string; year?: number;
    vin?: string; color?: string; category?: string;
    stationId?: string; dailyRate?: number;
  }>();

  if (!body.plate) return c.json({ error: 'Plate required' }, 400);

  const id = generateId();
  await c.env.DB.prepare(
    `INSERT INTO vehicles (id, tenant_id, station_id, plate, make, model, year, vin, color, category, daily_rate)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, auth.tenantId, body.stationId || auth.staff.station_id,
    body.plate.toUpperCase().replace(/\s/g, ''),
    body.make || null, body.model || null, body.year || null,
    body.vin || null, body.color || null, body.category || 'economy',
    body.dailyRate || null
  ).run();

  return c.json({ id }, 201);
});

// PATCH /api/fleet/vehicles/:id — update vehicle
fleet.patch('/vehicles/:id', requireRole('super_admin', 'station_manager', 'supervisor'), async (c) => {
  const auth = c.get('auth');
  const body = await c.req.json<Record<string, any>>();
  const allowedFields = ['status', 'station_id', 'mileage', 'fuel_level', 'notes', 'last_service_date', 'next_service_km'];

  const sets: string[] = ["updated_at = datetime('now')"];
  const vals: any[] = [];
  for (const [key, val] of Object.entries(body)) {
    if (allowedFields.includes(key)) {
      sets.push(`${key} = ?`);
      vals.push(val);
    }
  }

  if (vals.length === 0) return c.json({ error: 'No valid fields to update' }, 400);

  vals.push(c.req.param('id'), auth.tenantId);
  await c.env.DB.prepare(
    `UPDATE vehicles SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`
  ).bind(...vals).run();

  return c.json({ ok: true });
});

// GET /api/fleet/stats — fleet summary
fleet.get('/stats', async (c) => {
  const auth = c.get('auth');
  const stationId = c.req.query('stationId');

  let where = 'tenant_id = ?';
  const params: any[] = [auth.tenantId];
  if (stationId) { where += ' AND station_id = ?'; params.push(stationId); }

  const rows = await c.env.DB.prepare(
    `SELECT status, COUNT(*) as cnt FROM vehicles WHERE ${where} GROUP BY status`
  ).bind(...params).all<{ status: string; cnt: number }>();

  const stats: Record<string, number> = { total: 0 };
  for (const r of rows.results) {
    stats[r.status] = r.cnt;
    stats.total += r.cnt;
  }

  return c.json({ stats });
});

// POST /api/fleet/handoffs — create key handoff
fleet.post('/handoffs', async (c) => {
  const auth = c.get('auth');
  const body = await c.req.json<{
    vehicleId: string; toStaffId: string;
    fromStationId?: string; toStationId?: string; notes?: string;
  }>();

  const id = generateId();
  await c.env.DB.prepare(
    `INSERT INTO key_handoffs (id, tenant_id, vehicle_id, from_staff_id, to_staff_id, from_station_id, to_station_id, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, auth.tenantId, body.vehicleId, auth.staff.id, body.toStaffId, body.fromStationId || auth.staff.station_id, body.toStationId || null, body.notes || null).run();

  return c.json({ id, status: 'pending' }, 201);
});

// PATCH /api/fleet/handoffs/:id/confirm — confirm key receipt
fleet.patch('/handoffs/:id/confirm', async (c) => {
  const auth = c.get('auth');

  const handoff = await c.env.DB.prepare(
    "SELECT * FROM key_handoffs WHERE id = ? AND tenant_id = ? AND to_staff_id = ? AND status = 'pending'"
  ).bind(c.req.param('id'), auth.tenantId, auth.staff.id).first<any>();

  if (!handoff) return c.json({ error: 'Handoff not found or not for you' }, 404);

  await c.env.DB.prepare(
    "UPDATE key_handoffs SET status = 'confirmed', confirmed_at = datetime('now') WHERE id = ?"
  ).bind(c.req.param('id')).run();

  // Update vehicle station if transferring
  if (handoff.to_station_id && handoff.to_station_id !== handoff.from_station_id) {
    await c.env.DB.prepare(
      "UPDATE vehicles SET station_id = ?, updated_at = datetime('now') WHERE id = ?"
    ).bind(handoff.to_station_id, handoff.vehicle_id).run();
  }

  return c.json({ ok: true, status: 'confirmed' });
});

// GET /api/fleet/handoffs — list handoffs
fleet.get('/handoffs', async (c) => {
  const auth = c.get('auth');
  const rows = await c.env.DB.prepare(
    `SELECT h.*, f.display_name as from_name, t.display_name as to_name, v.plate
     FROM key_handoffs h
     JOIN staff f ON h.from_staff_id = f.id
     JOIN staff t ON h.to_staff_id = t.id
     JOIN vehicles v ON h.vehicle_id = v.id
     WHERE h.tenant_id = ? ORDER BY h.created_at DESC LIMIT 50`
  ).bind(auth.tenantId).all();

  return c.json({ handoffs: rows.results });
});

export default fleet;

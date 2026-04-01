import { Hono } from 'hono';
import type { Env, AuthContext } from '../env';
import { authMiddleware, requireRole } from '../middleware';
import { generateId } from '../utils';

const washers = new Hono<{ Bindings: Env; Variables: { auth: AuthContext } }>();
washers.use('*', authMiddleware());

// GET /api/washers/queue?stationId=X — current wash queue
washers.get('/queue', async (c) => {
  const auth = c.get('auth');
  const stationId = c.req.query('stationId') || auth.staff.station_id;

  const rows = await c.env.DB.prepare(
    `SELECT w.*, s.display_name as washer_name
     FROM wash_events w LEFT JOIN staff s ON w.washer_id = s.id
     WHERE w.tenant_id = ? AND w.station_id = ? AND w.status IN ('queued', 'in_progress')
     ORDER BY w.created_at`
  ).bind(auth.tenantId, stationId).all();

  return c.json({ queue: rows.results });
});

// GET /api/washers/history?stationId=X&limit=50 — completed washes
washers.get('/history', async (c) => {
  const auth = c.get('auth');
  const stationId = c.req.query('stationId') || auth.staff.station_id;
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200);

  const rows = await c.env.DB.prepare(
    `SELECT w.*, s.display_name as washer_name
     FROM wash_events w LEFT JOIN staff s ON w.washer_id = s.id
     WHERE w.tenant_id = ? AND w.station_id = ?
     ORDER BY w.created_at DESC LIMIT ?`
  ).bind(auth.tenantId, stationId, limit).all();

  return c.json({ washes: rows.results });
});

// POST /api/washers/queue — add vehicle to wash queue
washers.post('/queue', async (c) => {
  const auth = c.get('auth');
  const body = await c.req.json<{
    vehiclePlate: string;
    vehicleId?: string;
    washType?: string;
    bayNumber?: number;
    notes?: string;
  }>();

  if (!body.vehiclePlate) return c.json({ error: 'Vehicle plate required' }, 400);

  const id = generateId();
  const stationId = auth.staff.station_id;

  await c.env.DB.prepare(
    `INSERT INTO wash_events (id, tenant_id, station_id, vehicle_id, vehicle_plate, wash_type, bay_number, notes, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued')`
  ).bind(id, auth.tenantId, stationId, body.vehicleId || null, body.vehiclePlate.toUpperCase().replace(/\s/g, ''), body.washType || 'standard', body.bayNumber || null, body.notes || null).run();

  // Update vehicle status if linked
  if (body.vehicleId) {
    await c.env.DB.prepare("UPDATE vehicles SET status = 'cleaning', updated_at = datetime('now') WHERE id = ?")
      .bind(body.vehicleId).run();
  }

  return c.json({ id, status: 'queued' }, 201);
});

// PATCH /api/washers/queue/:id/start — washer starts a wash
washers.patch('/queue/:id/start', async (c) => {
  const auth = c.get('auth');
  const wash = await c.env.DB.prepare(
    "SELECT * FROM wash_events WHERE id = ? AND tenant_id = ? AND status = 'queued'"
  ).bind(c.req.param('id'), auth.tenantId).first();

  if (!wash) return c.json({ error: 'Wash not found or not queued' }, 404);

  await c.env.DB.prepare(
    "UPDATE wash_events SET status = 'in_progress', washer_id = ?, started_at = datetime('now') WHERE id = ?"
  ).bind(auth.staff.id, c.req.param('id')).run();

  return c.json({ ok: true, status: 'in_progress' });
});

// PATCH /api/washers/queue/:id/complete — washer completes a wash
washers.patch('/queue/:id/complete', async (c) => {
  const auth = c.get('auth');
  const body = await c.req.json<{ qualityScore?: number; notes?: string }>().catch(() => ({}));

  const wash = await c.env.DB.prepare(
    "SELECT * FROM wash_events WHERE id = ? AND tenant_id = ? AND status = 'in_progress'"
  ).bind(c.req.param('id'), auth.tenantId).first<any>();

  if (!wash) return c.json({ error: 'Wash not found or not in progress' }, 404);

  const startedAt = new Date(wash.started_at);
  const duration = Math.round((Date.now() - startedAt.getTime()) / 60000);

  await c.env.DB.prepare(
    `UPDATE wash_events SET status = 'completed', completed_at = datetime('now'),
     duration_minutes = ?, quality_score = ?, notes = COALESCE(?, notes)
     WHERE id = ?`
  ).bind(duration, (body as any).qualityScore || null, (body as any).notes || null, c.req.param('id')).run();

  // Update vehicle status back to available
  if (wash.vehicle_id) {
    await c.env.DB.prepare("UPDATE vehicles SET status = 'available', updated_at = datetime('now') WHERE id = ?")
      .bind(wash.vehicle_id).run();
  }

  return c.json({ ok: true, status: 'completed', durationMinutes: duration });
});

// GET /api/washers/leaderboard?stationId=X — washer performance
washers.get('/leaderboard', async (c) => {
  const auth = c.get('auth');
  const stationId = c.req.query('stationId') || auth.staff.station_id;

  const rows = await c.env.DB.prepare(
    `SELECT s.id, s.display_name,
            COUNT(w.id) as wash_count,
            ROUND(AVG(w.quality_score), 1) as avg_quality,
            ROUND(AVG(w.duration_minutes), 0) as avg_duration
     FROM staff s
     LEFT JOIN wash_events w ON w.washer_id = s.id AND w.status = 'completed'
     WHERE s.tenant_id = ? AND s.station_id = ? AND s.is_active = 1
     AND s.role IN ('washer', 'staff')
     GROUP BY s.id ORDER BY wash_count DESC LIMIT 20`
  ).bind(auth.tenantId, stationId).all();

  return c.json({ leaderboard: rows.results });
});

// GET /api/washers/stats?stationId=X — wash station stats
washers.get('/stats', async (c) => {
  const auth = c.get('auth');
  const stationId = c.req.query('stationId') || auth.staff.station_id;
  const today = new Date().toISOString().split('T')[0];

  const [queued, inProgress, completedToday, avgDuration] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) as cnt FROM wash_events WHERE tenant_id = ? AND station_id = ? AND status = 'queued'")
      .bind(auth.tenantId, stationId).first<{ cnt: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) as cnt FROM wash_events WHERE tenant_id = ? AND station_id = ? AND status = 'in_progress'")
      .bind(auth.tenantId, stationId).first<{ cnt: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) as cnt FROM wash_events WHERE tenant_id = ? AND station_id = ? AND status = 'completed' AND DATE(completed_at) = ?")
      .bind(auth.tenantId, stationId, today).first<{ cnt: number }>(),
    c.env.DB.prepare("SELECT ROUND(AVG(duration_minutes), 0) as avg FROM wash_events WHERE tenant_id = ? AND station_id = ? AND status = 'completed' AND DATE(completed_at) = ?")
      .bind(auth.tenantId, stationId, today).first<{ avg: number | null }>(),
  ]);

  return c.json({
    queued: queued?.cnt || 0,
    inProgress: inProgress?.cnt || 0,
    completedToday: completedToday?.cnt || 0,
    avgDurationMinutes: avgDuration?.avg || 0,
  });
});

// GET /api/washers/resources?stationId=X — station resource levels
washers.get('/resources', async (c) => {
  const auth = c.get('auth');
  const stationId = c.req.query('stationId') || auth.staff.station_id;

  const rows = await c.env.DB.prepare(
    'SELECT * FROM station_resources WHERE tenant_id = ? AND station_id = ?'
  ).bind(auth.tenantId, stationId).all();

  return c.json({ resources: rows.results });
});

// PATCH /api/washers/resources/:id — update resource level
washers.patch('/resources/:id', requireRole('super_admin', 'station_manager', 'supervisor'), async (c) => {
  const auth = c.get('auth');
  const body = await c.req.json<{ levelPercent: number }>();

  await c.env.DB.prepare(
    "UPDATE station_resources SET level_percent = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?"
  ).bind(body.levelPercent, c.req.param('id'), auth.tenantId).run();

  return c.json({ ok: true });
});

export default washers;

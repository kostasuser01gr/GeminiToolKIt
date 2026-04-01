import { Hono } from 'hono';
import type { Env, AuthContext } from '../env';
import { authMiddleware } from '../middleware';

const dashboard = new Hono<{ Bindings: Env; Variables: { auth: AuthContext } }>();
dashboard.use('*', authMiddleware());

// GET /api/dashboard/overview — unified operational overview
dashboard.get('/overview', async (c) => {
  const auth = c.get('auth');
  const stationId = c.req.query('stationId') || auth.staff.station_id;
  const today = new Date().toISOString().split('T')[0];

  const stationWhere = stationId ? 'AND station_id = ?' : '';
  const params = stationId ? [auth.tenantId, stationId] : [auth.tenantId];

  const [
    shiftsToday,
    openCases,
    washQueue,
    completedWashesToday,
    fleetAvailable,
    fleetTotal,
    recentAudit,
  ] = await Promise.all([
    c.env.DB.prepare(
      `SELECT COUNT(*) as total, SUM(CASE WHEN staff_id IS NOT NULL THEN 1 ELSE 0 END) as assigned
       FROM shifts WHERE tenant_id = ? ${stationWhere} AND date = ?`
    ).bind(...params, today).first<any>(),

    c.env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM cases WHERE tenant_id = ? ${stationWhere} AND status NOT IN ('resolved','closed')`
    ).bind(...params).first<{ cnt: number }>(),

    c.env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM wash_events WHERE tenant_id = ? ${stationWhere} AND status IN ('queued','in_progress')`
    ).bind(...params).first<{ cnt: number }>(),

    c.env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM wash_events WHERE tenant_id = ? ${stationWhere} AND status = 'completed' AND DATE(completed_at) = ?`
    ).bind(...params, today).first<{ cnt: number }>(),

    c.env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM vehicles WHERE tenant_id = ? ${stationWhere} AND status = 'available'`
    ).bind(...params).first<{ cnt: number }>(),

    c.env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM vehicles WHERE tenant_id = ? ${stationWhere}`
    ).bind(...params).first<{ cnt: number }>(),

    c.env.DB.prepare(
      `SELECT action, entity_type, actor_name, created_at FROM audit_log
       WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 10`
    ).bind(auth.tenantId).all(),
  ]);

  return c.json({
    shifts: {
      todayTotal: shiftsToday?.total || 0,
      todayAssigned: shiftsToday?.assigned || 0,
      coveragePercent: shiftsToday?.total ? Math.round((shiftsToday.assigned / shiftsToday.total) * 100) : 100,
    },
    cases: {
      open: openCases?.cnt || 0,
    },
    washes: {
      queued: washQueue?.cnt || 0,
      completedToday: completedWashesToday?.cnt || 0,
    },
    fleet: {
      available: fleetAvailable?.cnt || 0,
      total: fleetTotal?.cnt || 0,
      utilizationPercent: fleetTotal?.cnt ? Math.round(((fleetTotal.cnt - (fleetAvailable?.cnt || 0)) / fleetTotal.cnt) * 100) : 0,
    },
    recentActivity: recentAudit.results,
  });
});

// GET /api/dashboard/stations — list stations for nav
dashboard.get('/stations', async (c) => {
  const auth = c.get('auth');
  const rows = await c.env.DB.prepare(
    'SELECT id, code, name FROM stations WHERE tenant_id = ? AND is_active = 1 ORDER BY name'
  ).bind(auth.tenantId).all();
  return c.json({ stations: rows.results });
});

export default dashboard;

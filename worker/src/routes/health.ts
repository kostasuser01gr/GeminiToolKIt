import { Hono } from 'hono';
import type { Env } from '../env';

const health = new Hono<{ Bindings: Env }>();

// GET /api/health/live
health.get('/live', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// GET /api/health/ready
health.get('/ready', async (c) => {
  try {
    const dbCheck = await c.env.DB.prepare('SELECT 1 as ok').first<{ ok: number }>();
    const dbOk = dbCheck?.ok === 1;

    return c.json({
      status: dbOk ? 'ready' : 'degraded',
      checks: {
        database: dbOk ? 'ok' : 'error',
        storage: c.env.EVIDENCE_BUCKET ? 'ok' : 'not_configured',
      },
      timestamp: new Date().toISOString(),
    }, dbOk ? 200 : 503);
  } catch (e: any) {
    return c.json({
      status: 'error',
      checks: { database: 'error' },
      error: e.message,
      timestamp: new Date().toISOString(),
    }, 503);
  }
});

export default health;

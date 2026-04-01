import { Hono } from 'hono';
import type { Env, AuthContext, StaffUser } from './env';

type AuthEnv = { Bindings: Env; Variables: { auth: AuthContext } };

export function authMiddleware() {
  return async (c: any, next: () => Promise<void>) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const token = authHeader.slice(7);
    const db: D1Database = c.env.DB;

    const session = await db.prepare(
      `SELECT s.id, s.staff_id, s.expires_at, st.id as staff_pk, st.tenant_id, st.email, st.display_name, st.role, st.station_id, st.skills
       FROM staff_sessions s
       JOIN staff st ON s.staff_id = st.id
       WHERE s.session_token = ? AND st.is_active = 1`
    ).bind(token).first<any>();

    if (!session) {
      return c.json({ error: 'Invalid session' }, 401);
    }

    if (new Date(session.expires_at) < new Date()) {
      await db.prepare('DELETE FROM staff_sessions WHERE id = ?').bind(session.id).run();
      return c.json({ error: 'Session expired' }, 401);
    }

    const staff: StaffUser = {
      id: session.staff_pk,
      tenant_id: session.tenant_id,
      email: session.email,
      display_name: session.display_name,
      role: session.role,
      station_id: session.station_id,
      skills: JSON.parse(session.skills || '[]'),
    };

    c.set('auth', {
      staff,
      sessionId: session.id,
      tenantId: session.tenant_id,
    } as AuthContext);

    await next();
  };
}

export function requireRole(...roles: string[]) {
  return async (c: any, next: () => Promise<void>) => {
    const auth: AuthContext = c.get('auth');
    if (!roles.includes(auth.staff.role)) {
      return c.json({ error: 'Forbidden' }, 403);
    }
    await next();
  };
}

import { Hono } from 'hono';
import type { Env } from '../env';
import { generateId, hashPassword, verifyPassword, generateSessionToken, generateCsrfToken } from '../utils';

const auth = new Hono<{ Bindings: Env }>();

// POST /api/auth/login
auth.post('/login', async (c) => {
  const body = await c.req.json<{ email: string; password: string }>();
  if (!body.email || !body.password) {
    return c.json({ error: 'Email and password required' }, 400);
  }

  const staff = await c.env.DB.prepare(
    'SELECT id, tenant_id, email, display_name, password_hash, role, station_id, skills, is_active FROM staff WHERE email = ?'
  ).bind(body.email.toLowerCase().trim()).first<any>();

  if (!staff || !staff.is_active) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const valid = await verifyPassword(body.password, staff.password_hash);
  if (!valid) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const sessionToken = generateSessionToken();
  const csrfToken = generateCsrfToken();
  const ttl = parseInt(c.env.SESSION_TTL_SECONDS || '86400');
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

  await c.env.DB.prepare(
    `INSERT INTO staff_sessions (id, staff_id, session_token, csrf_token, expires_at, user_agent, created_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
  ).bind(generateId(), staff.id, sessionToken, csrfToken, expiresAt, c.req.header('User-Agent') || '').run();

  await c.env.DB.prepare(
    "UPDATE staff SET last_login_at = datetime('now') WHERE id = ?"
  ).bind(staff.id).run();

  return c.json({
    token: sessionToken,
    csrf: csrfToken,
    expiresAt,
    user: {
      id: staff.id,
      tenantId: staff.tenant_id,
      email: staff.email,
      displayName: staff.display_name,
      role: staff.role,
      stationId: staff.station_id,
      skills: JSON.parse(staff.skills || '[]'),
    },
  });
});

// POST /api/auth/logout
auth.post('/logout', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    await c.env.DB.prepare('DELETE FROM staff_sessions WHERE session_token = ?').bind(token).run();
  }
  return c.json({ ok: true });
});

// POST /api/auth/setup — one-time bootstrap for first tenant + admin
auth.post('/setup', async (c) => {
  const existing = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM tenants').first<{ cnt: number }>();
  if (existing && existing.cnt > 0) {
    return c.json({ error: 'System already initialized' }, 409);
  }

  const body = await c.req.json<{
    tenantName: string;
    tenantSlug: string;
    stationName: string;
    stationCode: string;
    adminEmail: string;
    adminPassword: string;
    adminName: string;
  }>();

  if (!body.tenantName || !body.adminEmail || !body.adminPassword || !body.adminName || !body.stationCode) {
    return c.json({ error: 'All fields are required' }, 400);
  }

  if (body.adminPassword.length < 8) {
    return c.json({ error: 'Password must be at least 8 characters' }, 400);
  }

  const tenantId = generateId();
  const stationId = generateId();
  const staffId = generateId();
  const passHash = await hashPassword(body.adminPassword);

  const batch = [
    c.env.DB.prepare(
      `INSERT INTO tenants (id, name, slug) VALUES (?, ?, ?)`
    ).bind(tenantId, body.tenantName, body.tenantSlug.toLowerCase().replace(/[^a-z0-9-]/g, '')),

    c.env.DB.prepare(
      `INSERT INTO stations (id, tenant_id, code, name) VALUES (?, ?, ?, ?)`
    ).bind(stationId, tenantId, body.stationCode.toUpperCase(), body.stationName || body.stationCode),

    c.env.DB.prepare(
      `INSERT INTO staff (id, tenant_id, email, display_name, password_hash, role, station_id, skills)
       VALUES (?, ?, ?, ?, ?, 'super_admin', ?, '["supervisor"]')`
    ).bind(staffId, tenantId, body.adminEmail.toLowerCase().trim(), body.adminName, passHash, stationId),
  ];

  await c.env.DB.batch(batch);

  return c.json({
    ok: true,
    tenantId,
    stationId,
    message: 'System initialized. You can now log in.',
  });
});

// GET /api/auth/me — get current user info
auth.get('/me', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.slice(7);
  const session = await c.env.DB.prepare(
    `SELECT s.expires_at, st.id, st.tenant_id, st.email, st.display_name, st.role, st.station_id, st.skills
     FROM staff_sessions s JOIN staff st ON s.staff_id = st.id
     WHERE s.session_token = ? AND st.is_active = 1`
  ).bind(token).first<any>();

  if (!session || new Date(session.expires_at) < new Date()) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  return c.json({
    user: {
      id: session.id,
      tenantId: session.tenant_id,
      email: session.email,
      displayName: session.display_name,
      role: session.role,
      stationId: session.station_id,
      skills: JSON.parse(session.skills || '[]'),
    },
  });
});

export default auth;

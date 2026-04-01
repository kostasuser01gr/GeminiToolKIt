import { Hono } from 'hono';
import type { Env, AuthContext } from '../env';
import { authMiddleware, requireRole } from '../middleware';
import { generateId } from '../utils';

const cases = new Hono<{ Bindings: Env; Variables: { auth: AuthContext } }>();
cases.use('*', authMiddleware());

// Valid status transitions
const STATUS_TRANSITIONS: Record<string, string[]> = {
  new: ['under_review'],
  under_review: ['waiting_customer', 'escalated', 'resolved'],
  waiting_customer: ['under_review', 'resolved', 'closed'],
  escalated: ['under_review', 'resolved'],
  resolved: ['closed', 'disputed'],
  disputed: ['under_review', 'escalated'],
  closed: [],
};

// GET /api/cases?stationId=X&status=X — list cases
cases.get('/', async (c) => {
  const auth = c.get('auth');
  const stationId = c.req.query('stationId') || auth.staff.station_id;
  const status = c.req.query('status');
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200);

  let sql = `SELECT c.*, s.display_name as assigned_name
     FROM cases c LEFT JOIN staff s ON c.assigned_to = s.id
     WHERE c.tenant_id = ?`;
  const params: any[] = [auth.tenantId];

  if (stationId) {
    sql += ' AND c.station_id = ?';
    params.push(stationId);
  }
  if (status) {
    sql += ' AND c.status = ?';
    params.push(status);
  }

  sql += ' ORDER BY c.updated_at DESC LIMIT ?';
  params.push(limit);

  const rows = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ cases: rows.results });
});

// GET /api/cases/:id — case detail
cases.get('/:id', async (c) => {
  const auth = c.get('auth');
  const caseRow = await c.env.DB.prepare(
    `SELECT c.*, s.display_name as assigned_name
     FROM cases c LEFT JOIN staff s ON c.assigned_to = s.id
     WHERE c.id = ? AND c.tenant_id = ?`
  ).bind(c.req.param('id'), auth.tenantId).first<any>();

  if (!caseRow) return c.json({ error: 'Case not found' }, 404);

  const [messages, notes, attachments] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM case_messages WHERE case_id = ? ORDER BY created_at')
      .bind(c.req.param('id')).all(),
    c.env.DB.prepare('SELECT * FROM case_notes WHERE case_id = ? ORDER BY created_at')
      .bind(c.req.param('id')).all(),
    c.env.DB.prepare('SELECT * FROM case_attachments WHERE case_id = ? ORDER BY created_at')
      .bind(c.req.param('id')).all(),
  ]);

  return c.json({
    case: caseRow,
    messages: messages.results,
    notes: notes.results,
    attachments: attachments.results,
  });
});

// POST /api/cases — create a new case
cases.post('/', async (c) => {
  const auth = c.get('auth');
  const body = await c.req.json<{
    stationId?: string;
    reservationId?: string;
    vehicleId?: string;
    customerName: string;
    customerPhone?: string;
    caseType?: string;
    priority?: string;
    subject: string;
    description?: string;
  }>();

  if (!body.customerName || !body.subject) {
    return c.json({ error: 'Customer name and subject required' }, 400);
  }

  const stationId = body.stationId || auth.staff.station_id;
  const caseId = generateId();
  const caseNumber = `CASE-${Date.now().toString(36).toUpperCase()}`;

  await c.env.DB.prepare(
    `INSERT INTO cases (id, tenant_id, station_id, reservation_id, vehicle_id, case_number,
     customer_name, customer_phone, case_type, priority, subject, description, assigned_to, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')`
  ).bind(
    caseId, auth.tenantId, stationId, body.reservationId || null, body.vehicleId || null,
    caseNumber, body.customerName, body.customerPhone || null,
    body.caseType || 'damage', body.priority || 'medium',
    body.subject, body.description || null, auth.staff.id
  ).run();

  // Create system message
  await c.env.DB.prepare(
    `INSERT INTO case_messages (id, case_id, sender_kind, sender_name, message_kind, body)
     VALUES (?, ?, 'system', 'System', 'system', ?)`
  ).bind(generateId(), caseId, `Case created by ${auth.staff.display_name}`).run();

  return c.json({ id: caseId, caseNumber, status: 'new' }, 201);
});

// PATCH /api/cases/:id/status — update case status
cases.patch('/:id/status', async (c) => {
  const auth = c.get('auth');
  const body = await c.req.json<{ status: string; notes?: string }>();
  const caseRow = await c.env.DB.prepare(
    'SELECT * FROM cases WHERE id = ? AND tenant_id = ?'
  ).bind(c.req.param('id'), auth.tenantId).first<any>();

  if (!caseRow) return c.json({ error: 'Case not found' }, 404);

  const allowed = STATUS_TRANSITIONS[caseRow.status];
  if (!allowed?.includes(body.status)) {
    return c.json({ error: `Cannot transition from ${caseRow.status} to ${body.status}` }, 400);
  }

  const updates: string[] = [`status = '${body.status}'`, "updated_at = datetime('now')"];
  if (body.status === 'resolved') updates.push("resolved_at = datetime('now')");
  if (body.notes) updates.push(`resolution_notes = '${body.notes.replace(/'/g, "''")}'`);

  await c.env.DB.prepare(
    `UPDATE cases SET ${updates.join(', ')} WHERE id = ?`
  ).bind(c.req.param('id')).run();

  // System message for status change
  await c.env.DB.prepare(
    `INSERT INTO case_messages (id, case_id, sender_kind, sender_name, message_kind, body)
     VALUES (?, ?, 'system', 'System', 'system', ?)`
  ).bind(generateId(), c.req.param('id'), `Status changed to ${body.status} by ${auth.staff.display_name}`).run();

  await c.env.DB.prepare(
    `INSERT INTO audit_log (id, tenant_id, actor_id, actor_name, action, entity_type, entity_id, details)
     VALUES (?, ?, ?, ?, ?, 'case', ?, ?)`
  ).bind(generateId(), auth.tenantId, auth.staff.id, auth.staff.display_name, `case_status_${body.status}`, c.req.param('id'), JSON.stringify({ from: caseRow.status, to: body.status })).run();

  return c.json({ ok: true, status: body.status });
});

// POST /api/cases/:id/messages — send a message on a case
cases.post('/:id/messages', async (c) => {
  const auth = c.get('auth');
  const body = await c.req.json<{ body: string; isInternal?: boolean }>();

  if (!body.body || body.body.length > 2000) {
    return c.json({ error: 'Message body required (max 2000 chars)' }, 400);
  }

  const caseRow = await c.env.DB.prepare(
    'SELECT id FROM cases WHERE id = ? AND tenant_id = ?'
  ).bind(c.req.param('id'), auth.tenantId).first();

  if (!caseRow) return c.json({ error: 'Case not found' }, 404);

  const msgId = generateId();
  await c.env.DB.prepare(
    `INSERT INTO case_messages (id, case_id, sender_kind, sender_id, sender_name, message_kind, body, is_internal)
     VALUES (?, ?, 'staff', ?, ?, 'text', ?, ?)`
  ).bind(msgId, c.req.param('id'), auth.staff.id, auth.staff.display_name, body.body, body.isInternal ? 1 : 0).run();

  // Update case timestamp
  await c.env.DB.prepare("UPDATE cases SET updated_at = datetime('now') WHERE id = ?")
    .bind(c.req.param('id')).run();

  return c.json({ id: msgId }, 201);
});

// POST /api/cases/:id/notes — add internal note
cases.post('/:id/notes', async (c) => {
  const auth = c.get('auth');
  const body = await c.req.json<{ body: string }>();

  if (!body.body || body.body.length > 2000) {
    return c.json({ error: 'Note body required (max 2000 chars)' }, 400);
  }

  const noteId = generateId();
  await c.env.DB.prepare(
    `INSERT INTO case_notes (id, case_id, staff_id, staff_name, body) VALUES (?, ?, ?, ?, ?)`
  ).bind(noteId, c.req.param('id'), auth.staff.id, auth.staff.display_name, body.body).run();

  return c.json({ id: noteId }, 201);
});

// PATCH /api/cases/:id/assign — assign case to staff
cases.patch('/:id/assign', requireRole('super_admin', 'station_manager', 'supervisor'), async (c) => {
  const auth = c.get('auth');
  const body = await c.req.json<{ staffId: string }>();

  await c.env.DB.prepare(
    "UPDATE cases SET assigned_to = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?"
  ).bind(body.staffId, c.req.param('id'), auth.tenantId).run();

  return c.json({ ok: true });
});

// GET /api/cases/stats — case statistics
cases.get('/stats/summary', async (c) => {
  const auth = c.get('auth');
  const stationId = c.req.query('stationId') || auth.staff.station_id;

  const [open, underReview, escalated, resolvedThisMonth] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) as cnt FROM cases WHERE tenant_id = ? AND station_id = ? AND status = 'new'")
      .bind(auth.tenantId, stationId).first<{ cnt: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) as cnt FROM cases WHERE tenant_id = ? AND station_id = ? AND status = 'under_review'")
      .bind(auth.tenantId, stationId).first<{ cnt: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) as cnt FROM cases WHERE tenant_id = ? AND station_id = ? AND status = 'escalated'")
      .bind(auth.tenantId, stationId).first<{ cnt: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) as cnt FROM cases WHERE tenant_id = ? AND station_id = ? AND status = 'resolved' AND resolved_at >= datetime('now', '-30 days')")
      .bind(auth.tenantId, stationId).first<{ cnt: number }>(),
  ]);

  return c.json({
    new: open?.cnt || 0,
    underReview: underReview?.cnt || 0,
    escalated: escalated?.cnt || 0,
    resolvedThisMonth: resolvedThisMonth?.cnt || 0,
  });
});

export default cases;

import { Hono } from 'hono';
import type { Env, AuthContext } from '../env';
import { authMiddleware, requireRole } from '../middleware';
import { generateId, getMondayOfWeek, addDays, parseJsonSafe } from '../utils';

const shifts = new Hono<{ Bindings: Env; Variables: { auth: AuthContext } }>();
shifts.use('*', authMiddleware());

// GET /api/shifts/schedules?stationId=X&weekStart=YYYY-MM-DD
shifts.get('/schedules', async (c) => {
  const auth = c.get('auth');
  const stationId = c.req.query('stationId') || auth.staff.station_id;
  const weekStart = c.req.query('weekStart') || getMondayOfWeek(new Date().toISOString().split('T')[0]);

  const schedule = await c.env.DB.prepare(
    `SELECT * FROM schedules WHERE tenant_id = ? AND station_id = ? AND week_start = ?`
  ).bind(auth.tenantId, stationId, weekStart).first<any>();

  if (!schedule) {
    return c.json({ schedule: null, shifts: [] });
  }

  const shiftRows = await c.env.DB.prepare(
    `SELECT sh.*, s.display_name as staff_name, s.role as staff_role
     FROM shifts sh LEFT JOIN staff s ON sh.staff_id = s.id
     WHERE sh.schedule_id = ? ORDER BY sh.date, sh.start_time`
  ).bind(schedule.id).all();

  return c.json({ schedule, shifts: shiftRows.results });
});

// POST /api/shifts/schedules — create a new weekly schedule
shifts.post('/schedules', requireRole('super_admin', 'station_manager', 'supervisor'), async (c) => {
  const auth = c.get('auth');
  const body = await c.req.json<{ stationId: string; weekStart: string }>();
  const stationId = body.stationId || auth.staff.station_id;
  const weekStart = getMondayOfWeek(body.weekStart);

  const existing = await c.env.DB.prepare(
    'SELECT id FROM schedules WHERE tenant_id = ? AND station_id = ? AND week_start = ?'
  ).bind(auth.tenantId, stationId, weekStart).first();

  if (existing) {
    return c.json({ error: 'Schedule already exists for this week' }, 409);
  }

  const scheduleId = generateId();
  await c.env.DB.prepare(
    `INSERT INTO schedules (id, tenant_id, station_id, week_start, status, created_by) VALUES (?, ?, ?, ?, 'draft', ?)`
  ).bind(scheduleId, auth.tenantId, stationId, weekStart, auth.staff.id).run();

  return c.json({ id: scheduleId, weekStart, status: 'draft' }, 201);
});

// POST /api/shifts/schedules/:id/generate — auto-generate shifts for a schedule
shifts.post('/schedules/:id/generate', requireRole('super_admin', 'station_manager', 'supervisor'), async (c) => {
  const auth = c.get('auth');
  const scheduleId = c.req.param('id');

  const schedule = await c.env.DB.prepare(
    'SELECT * FROM schedules WHERE id = ? AND tenant_id = ?'
  ).bind(scheduleId, auth.tenantId).first<any>();

  if (!schedule) return c.json({ error: 'Schedule not found' }, 404);
  if (schedule.status === 'published') return c.json({ error: 'Published schedules cannot be regenerated' }, 400);

  // Clear existing generated shifts
  await c.env.DB.prepare('DELETE FROM shifts WHERE schedule_id = ?').bind(scheduleId).run();

  // Get available staff for this station
  const staffList = await c.env.DB.prepare(
    `SELECT id, display_name, role, skills, contract_type, max_weekly_hours
     FROM staff WHERE tenant_id = ? AND station_id = ? AND is_active = 1
     AND role IN ('staff', 'washer', 'driver', 'supervisor')`
  ).bind(auth.tenantId, schedule.station_id).all<any>();

  // Get leave requests for this week
  const weekEnd = addDays(schedule.week_start, 6);
  const leaveRows = await c.env.DB.prepare(
    `SELECT staff_id, start_date, end_date FROM leave_requests
     WHERE tenant_id = ? AND status = 'approved'
     AND start_date <= ? AND end_date >= ?`
  ).bind(auth.tenantId, weekEnd, schedule.week_start).all<any>();

  const leaveByStaff = new Map<string, Set<string>>();
  for (const lr of leaveRows.results) {
    if (!leaveByStaff.has(lr.staff_id)) leaveByStaff.set(lr.staff_id, new Set());
    const start = new Date(lr.start_date + 'T00:00:00Z');
    const end = new Date(lr.end_date + 'T00:00:00Z');
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      leaveByStaff.get(lr.staff_id)!.add(d.toISOString().split('T')[0]);
    }
  }

  const shiftTypes = [
    { type: 'morning', start: '06:00', end: '14:00' },
    { type: 'evening', start: '14:00', end: '22:00' },
    { type: 'night', start: '22:00', end: '06:00' },
  ];

  const staffHours = new Map<string, number>();
  const staffLastNight = new Map<string, string>();
  const createdShifts: any[] = [];
  const conflicts: string[] = [];

  // For each day of the week
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const date = addDays(schedule.week_start, dayOffset);

    for (const st of shiftTypes) {
      // Determine required staff count (2 for morning/evening, 1 for night)
      const requiredCount = st.type === 'night' ? 1 : 2;

      // Find available staff
      const available = staffList.results.filter((s: any) => {
        // On leave?
        const staffLeave = leaveByStaff.get(s.id);
        if (staffLeave?.has(date)) return false;

        // Hours limit
        const hoursUsed = staffHours.get(s.id) || 0;
        if (hoursUsed + 8 > s.max_weekly_hours) return false;

        // 11-hour rest rule after night shift
        const lastNight = staffLastNight.get(s.id);
        if (lastNight === date && st.type === 'morning') return false;
        if (lastNight === date && st.type === 'evening') return false;

        return true;
      });

      // Sort by hours worked (fairness: assign to least-loaded first)
      available.sort((a: any, b: any) => (staffHours.get(a.id) || 0) - (staffHours.get(b.id) || 0));

      for (let i = 0; i < requiredCount; i++) {
        const assignee = available[i];
        const shiftId = generateId();
        const shift = {
          id: shiftId,
          tenant_id: auth.tenantId,
          schedule_id: scheduleId,
          station_id: schedule.station_id,
          staff_id: assignee?.id || null,
          date,
          shift_type: st.type,
          start_time: st.start,
          end_time: st.end,
          required_skills: '[]',
          status: 'scheduled',
        };

        createdShifts.push(shift);

        if (assignee) {
          staffHours.set(assignee.id, (staffHours.get(assignee.id) || 0) + 8);
          if (st.type === 'night') {
            staffLastNight.set(assignee.id, addDays(date, 1));
          }
        } else {
          conflicts.push(`${date} ${st.type}: no staff available (slot ${i + 1})`);
        }
      }
    }
  }

  // Batch insert shifts
  const stmts = createdShifts.map(s =>
    c.env.DB.prepare(
      `INSERT INTO shifts (id, tenant_id, schedule_id, station_id, staff_id, date, shift_type, start_time, end_time, required_skills, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(s.id, s.tenant_id, s.schedule_id, s.station_id, s.staff_id, s.date, s.shift_type, s.start_time, s.end_time, s.required_skills, s.status)
  );

  if (stmts.length > 0) {
    // D1 batch limit is 100 statements
    for (let i = 0; i < stmts.length; i += 100) {
      await c.env.DB.batch(stmts.slice(i, i + 100));
    }
  }

  return c.json({
    generated: createdShifts.length,
    assigned: createdShifts.filter(s => s.staff_id).length,
    unassigned: createdShifts.filter(s => !s.staff_id).length,
    conflicts,
  });
});

// PATCH /api/shifts/schedules/:id/status — update schedule status
shifts.patch('/schedules/:id/status', requireRole('super_admin', 'station_manager', 'supervisor'), async (c) => {
  const auth = c.get('auth');
  const body = await c.req.json<{ status: string }>();
  const validTransitions: Record<string, string[]> = {
    draft: ['review', 'published'],
    review: ['approved', 'draft'],
    approved: ['published', 'draft'],
    published: ['archived'],
  };

  const schedule = await c.env.DB.prepare(
    'SELECT * FROM schedules WHERE id = ? AND tenant_id = ?'
  ).bind(c.req.param('id'), auth.tenantId).first<any>();

  if (!schedule) return c.json({ error: 'Not found' }, 404);

  const allowed = validTransitions[schedule.status];
  if (!allowed?.includes(body.status)) {
    return c.json({ error: `Cannot transition from ${schedule.status} to ${body.status}` }, 400);
  }

  const updates: string[] = [`status = '${body.status}'`, "updated_at = datetime('now')"];
  if (body.status === 'published') updates.push("published_at = datetime('now')");
  if (body.status === 'approved') updates.push(`approved_by = '${auth.staff.id}'`);

  await c.env.DB.prepare(
    `UPDATE schedules SET ${updates.join(', ')} WHERE id = ?`
  ).bind(c.req.param('id')).run();

  await c.env.DB.prepare(
    `INSERT INTO audit_log (id, tenant_id, actor_id, actor_name, action, entity_type, entity_id, details)
     VALUES (?, ?, ?, ?, ?, 'schedule', ?, ?)`
  ).bind(generateId(), auth.tenantId, auth.staff.id, auth.staff.display_name, `status_${body.status}`, c.req.param('id'), JSON.stringify({ from: schedule.status, to: body.status })).run();

  return c.json({ ok: true, status: body.status });
});

// PUT /api/shifts/:id/assign — assign staff to a shift
shifts.put('/:id/assign', requireRole('super_admin', 'station_manager', 'supervisor'), async (c) => {
  const auth = c.get('auth');
  const body = await c.req.json<{ staffId: string | null }>();

  const shift = await c.env.DB.prepare(
    'SELECT sh.*, sc.status as schedule_status FROM shifts sh JOIN schedules sc ON sh.schedule_id = sc.id WHERE sh.id = ? AND sh.tenant_id = ?'
  ).bind(c.req.param('id'), auth.tenantId).first<any>();

  if (!shift) return c.json({ error: 'Shift not found' }, 404);
  if (shift.schedule_status === 'published') {
    return c.json({ error: 'Cannot modify published schedule' }, 400);
  }

  await c.env.DB.prepare(
    "UPDATE shifts SET staff_id = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(body.staffId, c.req.param('id')).run();

  return c.json({ ok: true });
});

// GET /api/shifts/staff — list staff for scheduling
shifts.get('/staff', async (c) => {
  const auth = c.get('auth');
  const stationId = c.req.query('stationId') || auth.staff.station_id;

  const rows = await c.env.DB.prepare(
    `SELECT id, display_name, email, role, skills, contract_type, max_weekly_hours
     FROM staff WHERE tenant_id = ? AND is_active = 1
     ${stationId ? 'AND station_id = ?' : ''}
     ORDER BY display_name`
  ).bind(...(stationId ? [auth.tenantId, stationId] : [auth.tenantId])).all();

  return c.json({ staff: rows.results.map((s: any) => ({ ...s, skills: JSON.parse(s.skills || '[]') })) });
});

// POST /api/shifts/swap — request a shift swap
shifts.post('/swap', async (c) => {
  const auth = c.get('auth');
  const body = await c.req.json<{ shiftId: string; reason?: string }>();

  const shift = await c.env.DB.prepare(
    'SELECT * FROM shifts WHERE id = ? AND tenant_id = ? AND staff_id = ?'
  ).bind(body.shiftId, auth.tenantId, auth.staff.id).first<any>();

  if (!shift) return c.json({ error: 'Shift not found or not yours' }, 404);

  const swapId = generateId();
  await c.env.DB.prepare(
    `INSERT INTO shift_swaps (id, tenant_id, shift_id, requester_id, reason) VALUES (?, ?, ?, ?, ?)`
  ).bind(swapId, auth.tenantId, body.shiftId, auth.staff.id, body.reason || null).run();

  return c.json({ id: swapId, status: 'open' }, 201);
});

// GET /api/shifts/swaps — list open swap requests
shifts.get('/swaps', async (c) => {
  const auth = c.get('auth');
  const rows = await c.env.DB.prepare(
    `SELECT sw.*, sh.date, sh.shift_type, sh.start_time, sh.end_time, s.display_name as requester_name
     FROM shift_swaps sw
     JOIN shifts sh ON sw.shift_id = sh.id
     JOIN staff s ON sw.requester_id = s.id
     WHERE sw.tenant_id = ? AND sw.status = 'open'
     ORDER BY sh.date`
  ).bind(auth.tenantId).all();

  return c.json({ swaps: rows.results });
});

// POST /api/shifts/swaps/:id/claim — claim a swap
shifts.post('/swaps/:id/claim', async (c) => {
  const auth = c.get('auth');
  const swap = await c.env.DB.prepare(
    "SELECT * FROM shift_swaps WHERE id = ? AND tenant_id = ? AND status = 'open'"
  ).bind(c.req.param('id'), auth.tenantId).first<any>();

  if (!swap) return c.json({ error: 'Swap not found or not open' }, 404);
  if (swap.requester_id === auth.staff.id) return c.json({ error: 'Cannot claim your own swap' }, 400);

  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE shift_swaps SET accepter_id = ?, status = 'approved', resolved_at = datetime('now'), approved_by = ? WHERE id = ?")
      .bind(auth.staff.id, auth.staff.id, c.req.param('id')),
    c.env.DB.prepare("UPDATE shifts SET staff_id = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(auth.staff.id, swap.shift_id),
  ]);

  return c.json({ ok: true, status: 'approved' });
});

export default shifts;

-- GeminiToolKit Foundation Schema
-- Multi-tenant car rental fleet operations platform

-- Tenants (organizations)
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#3b82f6',
  timezone TEXT DEFAULT 'Europe/Athens',
  locale TEXT DEFAULT 'en',
  plan TEXT DEFAULT 'starter' CHECK(plan IN ('starter','professional','enterprise')),
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Stations / Branches
CREATE TABLE IF NOT EXISTS stations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  latitude REAL,
  longitude REAL,
  timezone TEXT DEFAULT 'Europe/Athens',
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(tenant_id, code)
);

-- Staff users (employees, managers, admins)
CREATE TABLE IF NOT EXISTS staff (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff' CHECK(role IN ('super_admin','station_manager','supervisor','staff','washer','driver')),
  station_id TEXT REFERENCES stations(id),
  skills TEXT DEFAULT '[]',  -- JSON array: ["front_desk","driver","valeting","mechanic","supervisor"]
  contract_type TEXT DEFAULT 'full_time' CHECK(contract_type IN ('full_time','part_time','seasonal')),
  max_weekly_hours INTEGER DEFAULT 40,
  phone TEXT,
  is_active INTEGER DEFAULT 1,
  last_login_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(tenant_id, email)
);

-- Staff sessions
CREATE TABLE IF NOT EXISTS staff_sessions (
  id TEXT PRIMARY KEY,
  staff_id TEXT NOT NULL REFERENCES staff(id),
  session_token TEXT NOT NULL UNIQUE,
  csrf_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ip_hash TEXT,
  user_agent TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Fleet vehicles
CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  station_id TEXT REFERENCES stations(id),
  plate TEXT NOT NULL,
  make TEXT,
  model TEXT,
  year INTEGER,
  vin TEXT,
  color TEXT,
  category TEXT DEFAULT 'economy' CHECK(category IN ('economy','compact','midsize','fullsize','suv','premium','van')),
  status TEXT DEFAULT 'available' CHECK(status IN ('available','rented','cleaning','maintenance','transfer','decommissioned')),
  mileage INTEGER DEFAULT 0,
  fuel_level REAL DEFAULT 1.0,
  last_service_date TEXT,
  next_service_km INTEGER,
  daily_rate REAL,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(tenant_id, plate)
);

-- Schedules (weekly)
CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  station_id TEXT NOT NULL REFERENCES stations(id),
  week_start TEXT NOT NULL,  -- ISO date (Monday)
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft','review','approved','published','archived')),
  created_by TEXT REFERENCES staff(id),
  approved_by TEXT REFERENCES staff(id),
  published_at TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(tenant_id, station_id, week_start)
);

-- Individual shifts
CREATE TABLE IF NOT EXISTS shifts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  schedule_id TEXT NOT NULL REFERENCES schedules(id),
  station_id TEXT NOT NULL REFERENCES stations(id),
  staff_id TEXT REFERENCES staff(id),
  date TEXT NOT NULL,  -- ISO date
  shift_type TEXT NOT NULL CHECK(shift_type IN ('morning','evening','night')),
  start_time TEXT NOT NULL,  -- HH:MM
  end_time TEXT NOT NULL,    -- HH:MM
  required_skills TEXT DEFAULT '[]',  -- JSON array
  status TEXT DEFAULT 'scheduled' CHECK(status IN ('scheduled','confirmed','in_progress','completed','cancelled','no_show')),
  break_minutes INTEGER DEFAULT 30,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Shift swap requests
CREATE TABLE IF NOT EXISTS shift_swaps (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  shift_id TEXT NOT NULL REFERENCES shifts(id),
  requester_id TEXT NOT NULL REFERENCES staff(id),
  accepter_id TEXT REFERENCES staff(id),
  status TEXT DEFAULT 'open' CHECK(status IN ('open','claimed','approved','rejected','cancelled')),
  reason TEXT,
  approved_by TEXT REFERENCES staff(id),
  created_at TEXT DEFAULT (datetime('now')),
  resolved_at TEXT
);

-- Leave / time-off requests
CREATE TABLE IF NOT EXISTS leave_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  staff_id TEXT NOT NULL REFERENCES staff(id),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  leave_type TEXT DEFAULT 'annual' CHECK(leave_type IN ('annual','sick','personal','unpaid')),
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled')),
  reason TEXT,
  approved_by TEXT REFERENCES staff(id),
  created_at TEXT DEFAULT (datetime('now'))
);

-- Audit log
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  actor_id TEXT,
  actor_name TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details TEXT,  -- JSON
  ip_address TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_stations_tenant ON stations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_staff_tenant ON staff(tenant_id);
CREATE INDEX IF NOT EXISTS idx_staff_station ON staff(station_id);
CREATE INDEX IF NOT EXISTS idx_staff_email ON staff(tenant_id, email);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON staff_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON staff_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_vehicles_tenant ON vehicles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_station ON vehicles(station_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_schedules_week ON schedules(tenant_id, station_id, week_start);
CREATE INDEX IF NOT EXISTS idx_shifts_schedule ON shifts(schedule_id);
CREATE INDEX IF NOT EXISTS idx_shifts_staff ON shifts(staff_id);
CREATE INDEX IF NOT EXISTS idx_shifts_date ON shifts(tenant_id, station_id, date);
CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_log(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_leave_staff ON leave_requests(staff_id, start_date);

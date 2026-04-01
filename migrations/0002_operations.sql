-- GeminiToolKit Operations Schema
-- Wash operations, case management, reservations

-- Reservations
CREATE TABLE IF NOT EXISTS reservations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  station_id TEXT NOT NULL REFERENCES stations(id),
  reservation_number TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  customer_email TEXT,
  vehicle_id TEXT REFERENCES vehicles(id),
  pickup_date TEXT NOT NULL,
  return_date TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK(status IN ('active','completed','cancelled','no_show')),
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(tenant_id, reservation_number)
);

-- Wash events
CREATE TABLE IF NOT EXISTS wash_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  station_id TEXT NOT NULL REFERENCES stations(id),
  vehicle_id TEXT REFERENCES vehicles(id),
  washer_id TEXT REFERENCES staff(id),
  vehicle_plate TEXT NOT NULL,
  wash_type TEXT DEFAULT 'standard' CHECK(wash_type IN ('standard','premium','express','deep_clean')),
  status TEXT DEFAULT 'queued' CHECK(status IN ('queued','in_progress','completed','skipped')),
  quality_score REAL,  -- 1.0 - 5.0
  started_at TEXT,
  completed_at TEXT,
  duration_minutes INTEGER,
  bay_number INTEGER,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Cases (damage reports, disputes, evidence management)
CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  station_id TEXT NOT NULL REFERENCES stations(id),
  reservation_id TEXT REFERENCES reservations(id),
  vehicle_id TEXT REFERENCES vehicles(id),
  case_number TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  case_type TEXT DEFAULT 'damage' CHECK(case_type IN ('damage','dispute','complaint','inquiry','insurance')),
  status TEXT DEFAULT 'new' CHECK(status IN ('new','under_review','waiting_customer','escalated','resolved','closed','disputed')),
  priority TEXT DEFAULT 'medium' CHECK(priority IN ('low','medium','high','urgent')),
  subject TEXT NOT NULL,
  description TEXT,
  assigned_to TEXT REFERENCES staff(id),
  sla_deadline TEXT,
  resolved_at TEXT,
  resolution_notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(tenant_id, case_number)
);

-- Case messages (chat between staff and customer)
CREATE TABLE IF NOT EXISTS case_messages (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  sender_kind TEXT NOT NULL CHECK(sender_kind IN ('customer','staff','system')),
  sender_id TEXT,
  sender_name TEXT,
  message_kind TEXT DEFAULT 'text' CHECK(message_kind IN ('text','system','attachment','canned_reply')),
  body TEXT NOT NULL,
  is_internal INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Case attachments (evidence photos, documents)
CREATE TABLE IF NOT EXISTS case_attachments (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  message_id TEXT REFERENCES case_messages(id),
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER,
  storage_key TEXT NOT NULL,
  visibility TEXT DEFAULT 'all' CHECK(visibility IN ('all','staff_only')),
  uploaded_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Internal notes on cases
CREATE TABLE IF NOT EXISTS case_notes (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  staff_id TEXT NOT NULL REFERENCES staff(id),
  staff_name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Key handoff tracking
CREATE TABLE IF NOT EXISTS key_handoffs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
  from_staff_id TEXT NOT NULL REFERENCES staff(id),
  to_staff_id TEXT NOT NULL REFERENCES staff(id),
  from_station_id TEXT REFERENCES stations(id),
  to_station_id TEXT REFERENCES stations(id),
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','confirmed','rejected')),
  notes TEXT,
  confirmed_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Station resources (IoT supply levels)
CREATE TABLE IF NOT EXISTS station_resources (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  station_id TEXT NOT NULL REFERENCES stations(id),
  resource_type TEXT NOT NULL CHECK(resource_type IN ('soap','wax','water','towels','vacuum_bags')),
  level_percent REAL DEFAULT 100.0,
  last_refill TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(station_id, resource_type)
);

-- Indexes for operations
CREATE INDEX IF NOT EXISTS idx_reservations_tenant ON reservations(tenant_id, station_id);
CREATE INDEX IF NOT EXISTS idx_reservations_number ON reservations(tenant_id, reservation_number);
CREATE INDEX IF NOT EXISTS idx_wash_events_tenant ON wash_events(tenant_id, station_id);
CREATE INDEX IF NOT EXISTS idx_wash_events_washer ON wash_events(washer_id);
CREATE INDEX IF NOT EXISTS idx_wash_events_status ON wash_events(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_cases_tenant ON cases(tenant_id, station_id);
CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_cases_assigned ON cases(assigned_to);
CREATE INDEX IF NOT EXISTS idx_case_messages_case ON case_messages(case_id);
CREATE INDEX IF NOT EXISTS idx_case_attachments_case ON case_attachments(case_id);
CREATE INDEX IF NOT EXISTS idx_case_notes_case ON case_notes(case_id);
CREATE INDEX IF NOT EXISTS idx_key_handoffs_vehicle ON key_handoffs(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_station_resources ON station_resources(station_id);

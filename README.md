# GeminiToolKit — Unified Fleet Operations Platform

A production-ready, multi-tenant car rental fleet operations platform built on **Cloudflare Workers**, **D1**, and **R2**. Combines shift scheduling, wash operations, case management, and fleet tracking into a single unified system.

## Architecture

| Layer | Technology |
|-------|-----------|
| **Runtime** | Cloudflare Workers |
| **API Framework** | Hono v4 |
| **Database** | Cloudflare D1 (SQLite) |
| **Object Storage** | Cloudflare R2 |
| **Frontend** | React 18 + Vite 5 + TypeScript 5.5 |
| **Styling** | Tailwind CSS 3.4 |
| **State** | Zustand 4.5 |
| **Routing** | React Router 6 |
| **Icons** | Lucide React |

## Modules

### Shifts & Scheduling
- Auto-generate weekly schedules with constraint-aware solver
- 11-hour rest rule, max weekly hours, leave conflict detection
- Draft → Review → Approved → Published workflow
- Shift swap requests with claim/approve flow

### Wash Operations
- Vehicle wash queue management (add, start, complete)
- Real-time leaderboard with staff rankings
- Wash type tracking (exterior, interior, full, express)
- Station resource inventory

### Case Management
- 7-state case lifecycle (open → triaged → in_progress → awaiting_parts → resolved → closed / escalated)
- Real-time messaging thread per case
- Internal notes for staff-only context
- Priority-based filtering (low/medium/high/critical)
- Evidence photo attachments via R2

### Fleet Management
- Vehicle inventory with status tracking
- Key handoff tracking between staff
- Category filtering (economy → luxury)
- Mileage and maintenance tracking

### Staff Management
- Role-based access control (admin, manager, counter, delivery, wash, mechanic)
- Leave request workflow with approve/reject
- Session-based authentication with SHA-256 hashed passwords
- Multi-station assignment

## Getting Started

### Prerequisites
- Node.js 18+
- Cloudflare account (free tier works)
- Wrangler CLI (installed as dev dependency)

### Local Development

```bash
# Install dependencies
npm install
cd frontend && npm install && cd ..

# Create local D1 database and run migrations
npm run db:migrate:local

# Start development (API + frontend)
npm run dev:all
```

The API runs on `http://localhost:8787` and the frontend on `http://localhost:5173` (proxied to the API).

### First-Time Setup

1. Open `http://localhost:5173/setup`
2. Create your organization, first station, and admin account
3. Log in and start managing operations

## Deployment

### 1. Create Cloudflare Resources

```bash
# Create D1 database
npx wrangler d1 create gemini-toolkit-db
# Copy the database_id from the output and update wrangler.toml

# Create R2 bucket
npx wrangler r2 bucket create gemini-toolkit-evidence

# Set session secret
npx wrangler secret put SESSION_SECRET
```

### 2. Update Configuration

Edit `wrangler.toml` and replace the `database_id` placeholder with the real ID from step 1.

### 3. Run Remote Migrations

```bash
npm run db:migrate:remote
```

### 4. Deploy

```bash
npm run deploy
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/setup` | One-time platform bootstrap |
| POST | `/api/auth/login` | Staff login |
| POST | `/api/auth/logout` | Staff logout |
| GET | `/api/auth/me` | Current user |
| GET | `/api/dashboard/overview` | Unified KPI dashboard |
| GET/POST | `/api/shifts/schedules` | Schedule management |
| POST | `/api/shifts/generate` | Auto-generate schedule |
| PATCH | `/api/shifts/schedules/:id/status` | Schedule workflow |
| PUT | `/api/shifts/schedules/:id/assign` | Assign shift |
| POST | `/api/shifts/swap` | Request shift swap |
| GET | `/api/washers/queue` | Wash queue |
| POST | `/api/washers/queue` | Add to queue |
| PATCH | `/api/washers/:id/start` | Start wash |
| PATCH | `/api/washers/:id/complete` | Complete wash |
| GET | `/api/washers/leaderboard` | Staff rankings |
| GET/POST | `/api/cases` | Case list / create |
| GET | `/api/cases/:id` | Case detail |
| PATCH | `/api/cases/:id/status` | Update case status |
| POST | `/api/cases/:id/messages` | Add message |
| POST | `/api/cases/:id/notes` | Add internal note |
| GET/POST | `/api/fleet` | Vehicle list / create |
| PATCH | `/api/fleet/:id` | Update vehicle |
| GET/POST | `/api/fleet/handoffs` | Key handoffs |
| GET/POST | `/api/staff` | Staff list / create |
| GET/POST | `/api/staff/leave` | Leave requests |
| GET | `/api/health/live` | Liveness check |
| GET | `/api/health/ready` | Readiness check |

## Project Structure

```
├── package.json              # Root monorepo config
├── wrangler.toml             # Cloudflare Workers config
├── tsconfig.json             # Worker TypeScript config
├── migrations/
│   ├── 0001_foundation.sql   # Core tables (tenants, staff, vehicles, shifts)
│   └── 0002_operations.sql   # Operations tables (cases, wash, handoffs)
├── worker/src/
│   ├── index.ts              # Main Hono app entry
│   ├── env.ts                # TypeScript environment types
│   ├── middleware.ts          # Auth & RBAC middleware
│   ├── utils.ts              # Crypto, ID generation, date helpers
│   └── routes/
│       ├── auth.ts           # Authentication
│       ├── shifts.ts         # Scheduling API
│       ├── washers.ts        # Wash operations API
│       ├── cases.ts          # Case management API
│       ├── fleet.ts          # Fleet management API
│       ├── dashboard.ts      # Unified dashboard API
│       ├── staff.ts          # Staff management API
│       └── health.ts         # Health checks
└── frontend/
    ├── package.json          # Frontend dependencies
    ├── vite.config.ts        # Vite build config
    └── src/
        ├── main.tsx          # React entry
        ├── App.tsx           # Router & protected routes
        ├── api/client.ts     # API client with auth
        ├── store/            # Zustand stores
        ├── components/layout/# AppShell, Sidebar
        └── pages/            # All page components
```

## Multi-Tenancy

All data is isolated by `tenant_id`. The auth middleware automatically scopes queries to the authenticated user's tenant. Each tenant can have multiple stations, and staff are assigned per-station.

## License

Private — All rights reserved.

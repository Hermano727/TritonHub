# TritonHub API (FastAPI)

FastAPI service handling Supabase database access, JWT verification, ingest job orchestration, and Google Calendar sync.

## Setup

### 1. Python environment

```bash
cd services/api
python -m venv .venv
source .venv/bin/activate        # macOS/Linux
# .venv\Scripts\activate         # Windows
pip install -r requirements.txt
```

### 2. Environment variables

```bash
cp .env.example .env
```

Edit `.env` with your Supabase project credentials:

```
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_KEY=<your-anon-public-key>
```

Both values are found in your Supabase project under **Settings → API**.

### 3. Database schema

Run the following once in the **Supabase SQL Editor** to create the required tables:

```sql
create table if not exists quarters (
  id text primary key,
  label text not null,
  is_active boolean not null default false
);

create table if not exists vault_items (
  id uuid primary key default gen_random_uuid(),
  quarter_id text references quarters(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('syllabus', 'webreg', 'note')),
  updated_at timestamptz not null default now()
);

create table if not exists class_dossiers (
  id uuid primary key default gen_random_uuid(),
  quarter_id text references quarters(id) on delete cascade,
  course_code text not null,
  course_title text not null,
  professor_name text not null,
  professor_initials text not null,
  condensed_summary text[] not null default '{}',
  tldr text not null default '',
  confidence_percent integer not null default 0,
  chips jsonb not null default '[]',
  conflict jsonb
);
```

## Run locally

```bash
uvicorn app.main:app --reload --port 8000
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Liveness check — no DB required |
| `GET` | `/db-health` | Verifies Supabase connection |
| `GET` | `/docs` | Interactive OpenAPI UI |

```bash
curl http://127.0.0.1:8000/health
# {"status":"ok"}

curl http://127.0.0.1:8000/db-health
# {"status":"ok","db":"connected"}
```

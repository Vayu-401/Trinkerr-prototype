# Trinkerr Polls

A survey and polling platform for **verified investors**. Investors register, upload a PAN card or demat statement, and an admin approves them. Verified investors can then answer surveys (once each), create their own, read the aggregated results as charts, write opinion posts, and share a read-only link to their dashboard.

```
trinkerr-prototype/
├── backend/            Django 5.2 + Django REST Framework API, Celery worker, tests
├── frontend/           React 18 + Vite + TypeScript single-page app
├── docker-compose.yml  Postgres, Redis, MinIO, API, worker, beat
├── TECH_STACK.md       What each technology is, how it's used here, interview questions
└── .github/workflows/  CI: lint, tests, migrations check, dependency audit
```

## Run it locally

You need **Docker** (with Compose) and **Node.js 20+**.

```bash
# 1. Backend services: Postgres, Redis, MinIO, the API, the Celery worker and beat
cp backend/.env.example backend/.env
docker compose up --build
```

Then in a second terminal:

```bash
# 2. Demo data (an admin, 5 investors, 3 surveys with ~200 responses, posts, a share link)
docker compose exec -e SEED_ADMIN_PASSWORD=admin12345 web python manage.py seed_demo

# 3. Frontend
cd frontend
cp .env.example .env
npm install
npm run dev
```

Open:

| What | URL |
|---|---|
| App | http://localhost:5173 |
| API docs (Swagger) | http://localhost:8000/api/docs/ |
| Django admin | http://localhost:8000/django-admin/ |
| MinIO console (uploaded documents) | http://localhost:9001 (minioadmin / minioadmin) |

### Demo accounts (after `seed_demo`)

| Email | Password | State |
|---|---|---|
| admin@example.com | value of `SEED_ADMIN_PASSWORD` | Admin |
| priya@example.com, rahul@example.com, anita@example.com | Investor@12345 | Verified |
| vikram@example.com | Investor@12345 | Pending review |
| meera@example.com | Investor@12345 | Not verified yet |

The seed also creates 70 "panel" investors (`panel01@example.com` …) so the surveys have realistic numbers. One investor can only answer a survey once, so 5 investors alone can't produce ~200 responses. Set `SEED_INVESTOR_PASSWORD` to change the investor password. The command is safe to run twice and refuses to run when `DEBUG` is off.

To create your own admin instead: `docker compose exec web python manage.py createsuperuser`.

### Running without Docker

Install Postgres 16 and Redis 7 locally, then in `backend/.env` change the hosts `db`, `redis` and `minio` to `localhost`.

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver                 # API
celery -A config worker -l info            # in another terminal
celery -A config beat -l info              # in another terminal
```

Without MinIO the document upload step won't work. Everything else will.

## Tests

```bash
# Backend: needs Postgres reachable via DATABASE_URL (the Compose db works)
docker compose exec web pytest

# Frontend
cd frontend && npm test
```

The backend suite has 70 tests. They cover every row of the permission matrix, the verification state machine, survey validation, one-response-per-investor (409), aggregation correctness, idempotency and concurrency (`SKIP LOCKED`), percentages, share-link revocation and expiry, and cascading deletes.

## How it works

```
React SPA ──REST/JSON──► Django + DRF ──► PostgreSQL (source of truth)
   │                          │
   │ direct upload            └─ on_commit ─► Redis ─► Celery worker ─► survey_stats / option_stats
   ▼ (presigned POST)                                    ▲
S3 / MinIO (private)                         Celery beat sweeper (every 60 s)
```

1. **Submitting a response** writes `Response` + `ResponseAnswer` rows in one transaction. A unique constraint on `(survey, user)` makes a second attempt fail, and the API turns that into **409**. Only after the commit does it enqueue a Celery job.
2. **The worker** locks a batch of unprocessed responses with `SELECT … FOR UPDATE SKIP LOCKED`. It adds their counts to the small stats tables with `INSERT … ON CONFLICT DO UPDATE`, then marks them processed, all in one transaction. Re-running it changes nothing, and several workers can run at once.
3. **Results and dashboards** read only the small stats tables. The response shows `pending_responses`, so the UI can say "3 responses are still being counted" and poll until the count reaches zero.
4. **The beat sweeper** re-enqueues any response left unprocessed for over 2 minutes, in case a job was lost between commit and enqueue.

Auth uses a short-lived access token kept in memory (15 min) plus a refresh token in an httpOnly cookie scoped to `/api/auth/`. Refresh tokens rotate, and old ones are blacklisted. Verification documents never pass through the API server: the browser uploads straight to a private bucket using a presigned POST, and admins read them through 2-minute presigned links.

## Deploying to production

The code is production-ready, but deploying it needs your own cloud accounts. This repo doesn't include a live deployment. A typical setup:

| Piece | Where | Notes |
|---|---|---|
| Frontend | Vercel, Netlify or Cloudflare Pages | `npm run build`, publish `frontend/dist`, set `VITE_API_URL=https://api.example.com/api`, and add an SPA fallback so every path serves `index.html` |
| API | Render, Railway, Fly.io or ECS | Build `backend/Dockerfile`. Its default command runs migrations and starts gunicorn |
| Worker | same host, second service | Command: `celery -A config worker -l info` |
| Beat | same host, third service (exactly one) | Command: `celery -A config beat -l info` |
| Database | managed Postgres 16 | set `DATABASE_URL` |
| Broker | managed Redis | set `REDIS_URL` |
| Documents | AWS S3 or Cloudflare R2, **private** bucket | Leave both `S3_*_ENDPOINT` values empty for AWS. Add a bucket CORS rule allowing `POST` from your frontend origin |

Production environment checklist:

- `DJANGO_DEBUG=false` and a long random `DJANGO_SECRET_KEY` (`python -c "import secrets; print(secrets.token_urlsafe(50))"`)
- `DJANGO_ALLOWED_HOSTS=api.example.com`
- `CORS_ALLOWED_ORIGINS=https://app.example.com` and `FRONTEND_URL=https://app.example.com`
- Put frontend and API on the **same site** (for example `app.example.com` and `api.example.com`) so the `SameSite=Lax` refresh cookie works. If they must be on different sites, set `AUTH_COOKIE_SAMESITE=None` and add CSRF protection to the refresh endpoint.
- With `DEBUG` off, settings turn on HTTPS redirect, HSTS and secure cookies. `python manage.py check --deploy` passes apart from the optional HSTS-preload note.

## Changes from the original spec

Kept small and deliberate:

- **Token refresh has its own rate limit (60/min)** instead of sharing login's 10/min. Every page load calls refresh, so the shared limit locked people out after a few reloads.
- **`ResponseAnswer` foreign keys use `CASCADE`, not `PROTECT`.** With `PROTECT`, deleting a survey raised `ProtectedError`. The spec allows this fallback.
- **Dropped Django's automatic single-column indexes on `Response.survey` and `Response.user`.** The unique `(survey, user)` constraint and `user_history_idx` already cover those lookups (checked with `EXPLAIN`).
- **Added `/surveys/:id/edit`** so the existing `PUT /surveys/{id}` endpoint for drafts has a page.
- **React Router 7** instead of 6, to pick up a security fix. The routing API used here is the same.

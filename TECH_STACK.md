# Tech stack: what each piece is, how this project uses it, what interviewers ask

Every technology in this repo, in the order a request travels through the system. Each section has:

- **What it is**, in one or two plain sentences
- **Where it lives here**: the exact files to open
- **Trace**: what actually happens, step by step, with real values
- **Interview questions** with short answers you can say out loud

Read the "Big picture" first, then go section by section with the code open beside you.

---

## Big picture

```
Browser (React SPA)
  │  1. POST /api/surveys/{id}/responses   (Bearer access token in header)
  ▼
gunicorn ─► Django ─► DRF view ─► permission check ─► serializer validates JSON
                                       │
                                       ▼
                            submit_response() in one DB transaction
                              INSERT Response, INSERT ResponseAnswer×N
                              unique(survey,user) → duplicate = 409
                                       │ on_commit
                                       ▼
                                 Redis (queue) ──► Celery worker
                                                     SELECT … FOR UPDATE SKIP LOCKED
                                                     INSERT … ON CONFLICT (add counts)
                                                     UPDATE processed_at
                                                          │
  2. GET /api/surveys/{id}/results  ◄── reads only survey_stats + option_stats
```

The one sentence for an interview: *"Writes go into normalised Postgres tables with constraints guarding correctness. A Celery worker turns raw responses into small pre-computed stats tables, idempotently and safely under concurrency. Reads only touch those small tables, and the UI shows when counts are still catching up."*

---

# Backend

## 1. Python 3.12

**What it is.** The language for the whole backend.

**Where.** Everything under `backend/`. The Docker image is `python:3.12-slim` (`backend/Dockerfile`).

**Features used here you should recognise:**
- Type hints like `def _aggregate_batch(survey_id) -> int:` (`stats/tasks.py`)
- Keyword-only arguments: `def submit_response(*, survey, user, answers)`. The `*` forces callers to write `survey=…`, so arguments can't be swapped by accident (`submissions/services.py`)
- Set maths for validation: `set(chosen) <= {o.id for o in question.options.all()}` means "every chosen option belongs to this question"
- `secrets.token_urlsafe(32)` for share tokens: 32 random bytes, about 43 URL-safe characters. Use `secrets`, never `random`, for anything security-related

**Interview questions**
- *`secrets` vs `random`?* `random` is predictable (seeded PRNG) and fine for test data; `secrets` uses the OS's cryptographic RNG and is right for tokens and passwords. The seed command uses `random.Random(42)` on purpose so its demo data is reproducible.
- *What does `*` in a function signature do?* Everything after it must be passed by name.

---

## 2. Django 5.2 LTS

**What it is.** A "batteries included" Python web framework: ORM, migrations, auth, admin, settings, middleware. LTS means long-term support (security fixes for about 3 years).

**Where.**
- `backend/config/settings.py`: all configuration
- `backend/config/urls.py`: URL routing (everything under `/api/`)
- Apps: `accounts`, `verification`, `surveys`, `submissions`, `stats`, `posts`, `sharing`, `core`

**Key ideas in this project**

| Idea | Where | Why |
|---|---|---|
| **Custom user model** | `accounts/models.py`, `AUTH_USER_MODEL = "accounts.User"` | Log in by email, add `role` and `verification_status`. It **must** be set before the first migration, because changing it later is extremely painful |
| **Apps** | one folder per domain area | Keeps models, views and URLs for one feature together |
| **Migrations** | `*/migrations/` | Version-controlled database schema. `makemigrations` writes them, `migrate` applies them. CI fails if a model change has no migration |
| **Middleware** | `MIDDLEWARE` in settings | Code that wraps every request. `CorsMiddleware` must be first so even error responses get CORS headers |
| **Management command** | `accounts/management/commands/seed_demo.py` | Custom `python manage.py seed_demo` |
| **Signals-free design** | n/a | Business logic is in plain `services.py` functions, not hidden signals, so it's easy to follow and test |

**Trace: a user is created**
```
User.objects.create_user("New@Example.com", "pw", name="Asha")
  → normalize_email + .lower() → "new@example.com"
  → set_password("pw") → stores "pbkdf2_sha256$870000$salt$hash", never the raw password
  → INSERT INTO accounts_user …
```

**Interview questions**
- *Why a custom user model on day one?* Swapping it later means migrating every foreign key that points at users. Django's docs recommend it for every new project.
- *Where do you put business logic in Django?* Not in views (hard to reuse), not in signals (hidden). Use service functions like `submit_response()` that views call.
- *How are passwords stored?* Salted, slow hashes (PBKDF2 by default, Argon2 optional). `check_password` re-hashes the attempt and compares.

---

## 3. Django ORM (talking to PostgreSQL)

**What it is.** Python classes that map to tables. You write `Survey.objects.filter(status="published")` and Django writes the SQL.

**Where.** Every `models.py`, plus the queries in views and services.

**Patterns used here, each with the SQL it produces**

| Python | What it does | Example in repo |
|---|---|---|
| `select_related("creator")` | SQL JOIN for a ForeignKey, 1 query instead of N+1 | `SurveyViewSet.annotated` |
| `prefetch_related("questions__options")` | 1 extra query per relation, then stitches results in Python | survey detail and results |
| `annotate(question_count=Count("questions", distinct=True))` | adds a computed column (`COUNT(...) GROUP BY`) | survey list |
| `Exists(Response.objects.filter(survey=OuterRef("pk"), user=me))` | SQL `EXISTS` subquery that gives a true/false per row | the `has_responded` flag |
| `select_for_update(skip_locked=True)` | `SELECT … FOR UPDATE SKIP LOCKED` | `stats/tasks.py` |
| `transaction.atomic()` | BEGIN … COMMIT, or ROLLBACK on any exception | `submit_response`, aggregation |
| `transaction.on_commit(fn)` | run `fn` only **after** a successful commit | enqueuing the Celery job |
| `TruncMonth("submitted_at")` | `date_trunc('month', …)` | dashboard timeline |
| `bulk_create([...])` | one INSERT with many rows | answers, options, seed data |

**Trace: the N+1 problem, and how `select_related` avoids it**
```
# BAD: 1 query for 20 surveys + 20 queries for their creators = 21 queries
for s in Survey.objects.all()[:20]: print(s.creator.name)

# GOOD: 1 query with a JOIN
for s in Survey.objects.select_related("creator")[:20]: print(s.creator.name)
```

**Interview questions**
- *`select_related` vs `prefetch_related`?* `select_related` uses a SQL JOIN and only works for single-valued relations (ForeignKey, OneToOne). `prefetch_related` runs a separate query and works for many-valued relations (reverse FK, ManyToMany).
- *Why `on_commit` before enqueuing a job?* If you enqueue inside the transaction, a fast worker can run before the commit and find no rows. Or the transaction rolls back and the job processes data that never existed.
- *What does `F()` / doing maths in SQL buy you?* No lost updates. See `ON CONFLICT … count + EXCLUDED.count` in section 5.

---

## 4. Django REST Framework (DRF)

**What it is.** A toolkit on top of Django for JSON APIs: serializers (validation and output), views and viewsets, authentication, permissions, throttling, pagination.

**Where.**
- Serializers: `*/serializers.py`
- Views: `accounts/views.py`, `surveys/views.py` (a `GenericViewSet` with custom `@action`s), `posts/views.py` and the others
- Permissions: `core/permissions.py`
- Global defaults: `REST_FRAMEWORK` in `config/settings.py`

**The request pipeline: what runs, in order**
```
1. Authentication   JWTAuthentication reads "Authorization: Bearer <token>" → request.user
2. Permissions      has_permission(): e.g. IsVerifiedOrAdmin → 403 if not verified
3. Throttling       e.g. 10/min on login → 429 when exceeded
4. Your view code   validate with a serializer → call a service → return Response
5. Object perms     check_object_permissions() → IsOwnerOrAdmin on the specific survey/post
```

**Serializers do two jobs**
- **Input validation**: `SurveyWriteSerializer` enforces a title of at least 3 characters, 1–20 questions, 2–10 options, and unique option texts. It returns field-level errors such as `{"questions": [{"options": ["Option texts must be unique…"]}]}`.
- **Output shaping**: `SurveyListSerializer` decides which fields the client sees.

**Permission classes in this repo**

| Class | Rule |
|---|---|
| `IsAdminRole` | `user.role == "admin"` |
| `IsVerifiedOrAdmin` | admin, or investor with `verification_status == "verified"` |
| `IsUnverifiedInvestor` | investor who is *not* verified (only they may upload documents) |
| `IsOwnerOrAdmin` | object-level: the view sets `owner_field = "creator_id"` or `"author_id"` |

**Trace: an unverified investor calls `GET /api/surveys`**
```
JWT valid → request.user = Meera (status "unverified")
IsVerifiedOrAdmin.has_permission → user.can_use_surveys → False
→ 403 {"detail": "Your investor account must be verified to use this feature."}
```

**Throttling.** Scoped rates: `auth` 10/min (login and register), `auth_refresh` 60/min, `public_dashboard` 30/min, plus global anon/user limits. The counters live in Django's cache.

**Pagination.** `PageNumberPagination` with `PAGE_SIZE = 20` returns `{count, next, previous, results}`.

**Interview questions**
- *Where do you check "can this user edit THIS object"?* In `has_object_permission`, which runs when `get_object()` / `check_object_permissions()` is called. `has_permission` runs before you know which object.
- *Why return 404 instead of 403 for someone else's draft?* A 403 would confirm the draft exists. Our `get_object` treats others' drafts as missing.
- *How do you map a DB constraint error to an HTTP status?* Catch `IntegrityError` and raise a custom `Conflict` (`core/exceptions.py`) with `status_code = 409`.

---

## 5. PostgreSQL 16

**What it is.** The relational database and the single source of truth. Chosen because the data is relational and needs strict constraints, transactions and some Postgres-specific features.

**Where.** Models in every app. Raw SQL in `stats/tasks.py`. Connection via `DATABASE_URL`.

**Postgres features this project depends on**

**a) Unique constraint as the real guard against double voting**
```python
UniqueConstraint(fields=["survey", "user"], name="one_response_per_user_per_survey")
```
Trace with two simultaneous requests from the same investor:
```
Request A: INSERT response(survey=S, user=U) → OK
Request B: INSERT response(survey=S, user=U) → ERROR: duplicate key violates unique constraint
           → IntegrityError → Conflict → HTTP 409
```
An "if not exists then insert" check in Python would let **both** through when they run at the same moment. Only the database can guarantee this.

**b) Partial index**
```python
Index(fields=["survey"], condition=Q(processed_at__isnull=True), name="unprocessed_resp_idx")
```
It only indexes rows that still need processing. It stays tiny however many responses pile up, and makes `pending_responses` and the worker's lookup cheap. Verified with `EXPLAIN`: `Index Scan using unprocessed_resp_idx`.

**c) Composite index for history**
```python
Index(fields=["user", "-submitted_at"], name="user_history_idx")
```
"My last 20 responses, newest first" reads straight from this index.

**d) `INSERT … ON CONFLICT DO UPDATE` (upsert) with maths in SQL**
```sql
INSERT INTO option_stats (option_id, survey_id, selection_count) VALUES (%s, %s, %s)
ON CONFLICT (option_id)
DO UPDATE SET selection_count = option_stats.selection_count + EXCLUDED.selection_count
```
`EXCLUDED` means "the row I tried to insert". Two workers adding 3 and 5 always end at +8. Python read-modify-write could lose one of them:
```
Worker A reads 10, Worker B reads 10, A writes 13, B writes 15  → lost A's +3 (should be 18)
```

**e) `SELECT … FOR UPDATE SKIP LOCKED`**
Each worker locks a batch of rows. Other workers **skip** locked rows instead of waiting. That is how several workers share a queue without processing the same response twice. (Tested in `test_locked_batch_is_skipped_by_second_worker`.)

**f) `EXPLAIN`**
Phase 7 checked the plans. That review found Django's automatic single-column FK indexes on `Response.user` / `Response.survey` were redundant (the composite and unique indexes already cover them), so we dropped them. Fewer indexes means faster inserts.

**Interview questions**
- *Why not MongoDB?* Users → surveys → questions → options → answers is relational, and we need constraints and multi-row transactions. A document store would push those guarantees into application code.
- *What is a partial index and when would you use one?* It indexes only rows matching a condition. Use it when you keep querying a small subset of a big table ("unprocessed", "active", "not deleted").
- *What's the isolation level, and why doesn't it matter much here?* Postgres defaults to READ COMMITTED. Correctness here comes from row locks and unique constraints, which work at any level.

---

## 6. psycopg 3

**What it is.** The Python driver that actually talks to Postgres. Django uses it underneath. `psycopg[binary]` ships a precompiled C library, so no compiler is needed.

**Where.** `requirements.txt`. The only direct use is `connection.cursor()` for the upsert SQL in `stats/tasks.py`.

**Interview question.** *Why `%s` placeholders, not f-strings, in SQL?* The driver sends values separately from the SQL text, which prevents SQL injection. Never build SQL by string formatting.

---

## 7. Authentication: JWT with `djangorestframework-simplejwt` and an httpOnly refresh cookie

**What it is.** A JWT (JSON Web Token) is a signed string carrying `{user_id, expiry}`. The server checks the signature instead of looking up a session. Simple JWT is the DRF library that issues, verifies, rotates and blacklists them.

**Where.** `accounts/views.py` (register/login/refresh/logout/me), `SIMPLE_JWT` and `AUTH_COOKIE_*` in settings, and `frontend/src/api/client.ts`.

**The design: two tokens**

| | Access token | Refresh token |
|---|---|---|
| Lifetime | 15 minutes | 7 days |
| Stored in | JavaScript **memory** (a variable) | **httpOnly cookie**, path `/api/auth/` |
| Sent | `Authorization: Bearer …` on every API call | automatically by the browser, only to `/api/auth/*` |
| If stolen by XSS | only usable for at most 15 min | JavaScript can't read httpOnly cookies |

**Trace: page reload**
```
1. Memory is empty after reload, so there's no access token.
2. AuthContext → POST /api/auth/refresh (browser attaches the refresh cookie)
3. Server validates it, ROTATES it: issues a new refresh cookie and BLACKLISTS the old one
4. Returns {access}; the SPA stores it in memory → GET /api/users/me → logged in
```

**Trace: access token expires mid-session**
```
GET /api/surveys → 401
axios interceptor → POST /auth/refresh (once, shared by all parallel requests)
→ retry the original GET with the new token → 200. The user notices nothing.
```

**Rotation and blacklisting.** If an attacker replays an old refresh token, it's on the blacklist and gets rejected (tested in `test_refresh_rotates_and_old_token_rejected`).

**Login errors.** "Invalid credentials" is the same for an unknown email and a wrong password, so attackers can't use the form to discover which emails are registered.

**Interview questions**
- *Why not keep the token in localStorage?* Any XSS script can read localStorage. Memory plus an httpOnly cookie limits what a script can steal.
- *JWT vs server sessions?* JWTs are stateless (no DB lookup per request) but can't be revoked before they expire. Hence the short access lifetime plus a revocable (blacklisted) refresh token.
- *What does `SameSite=Lax` do?* The browser won't send the cookie on cross-site sub-requests (images, fetches, form POSTs from other sites). That blocks most CSRF. It's also why frontend and API should be on the same site (`app.example.com` + `api.example.com`).

---

## 8. CORS (`django-cors-headers`)

**What it is.** Browsers block a page on one origin (`localhost:5173`) from reading responses from another (`localhost:8000`) unless the server opts in with CORS headers.

**Where.** `CorsMiddleware` (first in `MIDDLEWARE`), `CORS_ALLOWED_ORIGINS`, `CORS_ALLOW_CREDENTIALS = True`.

**Trace.** The browser sends a *preflight* `OPTIONS /api/auth/login` with `Origin: http://localhost:5173`. The server answers `Access-Control-Allow-Origin: http://localhost:5173` and `Access-Control-Allow-Credentials: true`, and only then does the browser send the real POST.

**Interview question.** *Why not `*`?* Browsers refuse `*` together with credentials (cookies). And an allowlist stops random sites from calling your API with the user's cookies.

---

## 9. Celery + Redis (background jobs)

**What it is.** Celery runs Python functions ("tasks") in separate worker processes. Redis is the **broker**: the queue where task messages wait. **Celery beat** is a scheduler that enqueues tasks on a timer.

**Where.**
- `config/celery.py`: the Celery app, reads `CELERY_*` settings
- `stats/tasks.py`: `aggregate_survey` and `sweep_unprocessed`
- `submissions/services.py`: `transaction.on_commit(lambda: aggregate_survey.delay(...))`
- `docker-compose.yml`: separate `worker` and `beat` services

**Trace: 3 investors answer, end to end** (seen in a real run during Phase 4)
```
t=0.0s  Anita submits → COMMIT → aggregate_survey.delay("da18…") → message in Redis
t=0.1s  worker picks it up → locks Anita's response (FOR UPDATE SKIP LOCKED)
        → option_stats: Equity +1, Gold +1, Up +1 → survey_stats: participants +1
        → processed_at = now() → COMMIT
...      Vikram, Meera same
Results page polls every 3 s while pending_responses > 0, then stops.
Final: Equity 2/3 = 66.7%, Mutual Funds 1/3 = 33.3%, ...
```

**The four properties that make it correct** (memorise these)
1. **Idempotent**: counting and setting `processed_at` happen in one transaction, so re-running a job counts nothing twice.
2. **Concurrency-safe**: `SKIP LOCKED` means workers never grab the same batch.
3. **No lost updates**: counts are added in SQL, not in Python.
4. **Durable**: enqueue only after commit. The beat **sweeper** re-enqueues anything still unprocessed after 2 minutes, in case Redis lost a message.

**Settings worth explaining**
- `CELERY_TASK_ACKS_LATE = True`: a task is removed from the queue only after it *finishes*, so a crashed worker's task is redelivered. That's safe *because* the task is idempotent.
- `autoretry_for=(Exception,), retry_backoff=True`: retries with growing delays (1 s, 2 s, 4 s…).
- `CELERY_TASK_TIME_LIMIT = 120`: kills stuck tasks.

**Interview questions**
- *Why not compute results on every page view?* `GROUP BY` over millions of answer rows on every view is slow. Pre-computed tables make reads cost a handful of rows. The trade-off is eventual consistency, shown honestly as `pending_responses`.
- *What happens if the worker crashes mid-batch?* The transaction rolls back, so nothing is half-counted. With acks_late the task is redelivered, and the sweeper is a second safety net.
- *Redis is in-memory; what if it restarts?* Queued messages may be lost, but no *data* is lost, because responses sit in Postgres with `processed_at IS NULL` and the sweeper picks them up.
- *Why exactly one beat process?* Two beats would schedule every periodic task twice.

---

## 10. S3 / MinIO with `boto3` (file storage, presigned URLs)

**What it is.** S3 is AWS object storage (files in "buckets"). MinIO is an S3-compatible server you run locally in Docker. `boto3` is the AWS Python SDK. A **presigned URL** is a temporary, signed link that lets someone upload or download one object without holding AWS keys.

**Where.** `core/storage.py`, `verification/views.py`, `verification/admin_views.py`, and `frontend/src/api/verification.ts`.

**Trace: an investor uploads a PAN card**
```
1. Browser → POST /api/verification/upload-url {filename:"pan.pdf", content_type:"application/pdf", size_bytes:45}
   Server validates type and size (≤ 5 MB), builds key "verification/<user-id>/<uuid>-pan.pdf",
   returns a presigned POST: {url, fields:{key, policy, signature, Content-Type…}}
   The policy itself enforces: same Content-Type, size between 1 byte and 5 MB, expires in 300 s.
2. Browser → POST straight to MinIO/S3 (FormData: all fields first, file LAST)
   The file never touches our API server.
3. Browser → POST /api/verification/documents {storage_key}
   Server checks the key starts with "verification/<this user's id>/",
   calls head_object() and takes size and type FROM STORAGE, not from the client,
   saves VerificationDocument, sets status pending.
4. Admin opens the investor → server signs a GET link valid for 120 s.
```

**Two endpoints, one subtle bug avoided.** Inside Docker the API reaches MinIO at `http://minio:9000`, but the browser can only reach `http://localhost:9000`. Signatures include the host, so URLs the browser uses are signed with `S3_PUBLIC_ENDPOINT` and server-side calls use `S3_INTERNAL_ENDPOINT`.

**Interview questions**
- *Why presigned uploads?* Big files don't tie up API workers, bandwidth goes straight to storage, and the bucket stays private.
- *Why re-check size and type after upload?* Never trust the client. Even with a signed policy, the server reads the real metadata with `head_object`.
- *How do you stop user A registering user B's file?* The key must start with A's own user-id prefix.

---

## 11. drf-spectacular (OpenAPI / Swagger docs)

**What it is.** Generates an OpenAPI 3 schema from your DRF code and serves Swagger UI.

**Where.** `/api/schema/` and `/api/docs/`. `@extend_schema(...)` decorators fill gaps where it can't guess the request or response shape.

**Interview question.** *Why generate docs from code?* They can't drift out of date, and frontend devs can try endpoints in the browser.

---

## 12. django-environ (configuration)

**What it is.** Reads settings from environment variables and `.env`, following the 12-factor app idea: the same code runs everywhere and only the config changes.

**Where.** `config/settings.py`, for example `env.db("DATABASE_URL")` turns `postgres://polls:polls@db:5432/polls` into Django's `DATABASES` dict. `backend/.env.example` documents every variable. Real `.env` files are git-ignored.

**Interview question.** *Why not hard-code settings?* Secrets in git are a leak, and you need different values per environment.

---

## 13. gunicorn

**What it is.** A production WSGI server. `runserver` is for development only. gunicorn runs several worker processes that each handle requests.

**Where.** `backend/Dockerfile` CMD: `gunicorn config.wsgi:application --workers ${WEB_CONCURRENCY:-3}`. In development, `docker-compose.yml` overrides it with `runserver` (auto-reload).

**Interview question.** *How many workers?* A common starting point is `2 × CPU cores + 1`, then measure.

---

# Frontend

## 14. React 18

**What it is.** A UI library: you describe what the screen should look like for the current state, and React updates the DOM to match.

**Where.** `frontend/src/`: pages in `pages/`, reusable pieces in `components/`, auth in `auth/`.

**Concepts used here**

| Concept | Example |
|---|---|
| Components and props | `<StatusChip status="pending" />` |
| `useState` | which options are ticked on the take-survey page |
| `useEffect` | restoring the session on first load (`AuthContext.tsx`) |
| Context | `AuthProvider` and `ToastProvider` make `user` and `toast` available everywhere without passing props through every layer |
| `React.lazy` + `Suspense` | chart pages load on demand, so Recharts (~360 KB) isn't in the first download (`App.tsx`) |
| StrictMode | runs effects twice in development to catch bugs. The shared refresh promise makes that harmless |

**Interview questions**
- *Why Context for auth instead of passing props?* Many distant components need `user`. Context avoids "prop drilling".
- *What does code-splitting buy?* A smaller first download. The login page doesn't need the charting library.

---

## 15. Vite

**What it is.** The dev server and build tool. It starts instantly in development (serves ES modules directly), has hot reload, and bundles and minifies for production.

**Where.** `frontend/vite.config.ts` (also configures Vitest). `npm run dev` / `npm run build`. Env vars must start with `VITE_` to reach the browser, for example `VITE_API_URL`.

**Interview question.** *Why must browser env vars start with `VITE_`?* Anything in the bundle is public. The prefix stops you leaking server secrets by accident.

---

## 16. TypeScript

**What it is.** JavaScript with static types, checked at build time.

**Where.** Every `.ts` / `.tsx` file. API response shapes live in `src/api/types.ts` (for example `SurveyResults`, `Post`), so a backend field rename shows up as a compile error, not a blank screen. `strict: true` is on.

**Interview question.** *`interface` vs `type`?* Mostly interchangeable. `interface` can be extended and merged, while `type` handles unions like `"single" | "multiple"`.

---

## 17. React Router

**What it is.** Maps URLs to pages in a single-page app without full reloads.

**Where.** `src/App.tsx` (route table) and `src/auth/guards.tsx`.

**Guards = components that redirect**
```
RequireAuth      not logged in      → /login (remembers where you were going)
RequireVerified  logged in, unverified → /verification
RequireAdmin     not admin          → /
GuestOnly        already logged in  → / or /verification
```
Unit-tested in `guards.test.tsx`.

**Important.** Guards are only UX. **Security is enforced by the API**: an unverified user who hand-types a URL still gets 403 from the server.

**Note.** The project uses React Router 7. Version 6 had an open-redirect advisory, and the APIs used here (`BrowserRouter`, `Routes`, `Navigate`, `useParams`) are the same.

---

## 18. TanStack Query (React Query)

**What it is.** Manages *server state*: fetching, caching, refetching, loading and error flags. You stop writing `useEffect` + `useState` for every API call.

**Where.** Every page that loads data. Defaults are in `main.tsx` (no retries on 4xx).

**Patterns used**
```ts
// cache key ↔ data
useQuery({ queryKey: ["surveys", "results", id], queryFn: () => surveysApi.results(id) })

// auto-poll while the worker is behind, stop when caught up
refetchInterval: (q) => (q.state.data?.pending_responses ?? 0) > 0 ? 3000 : false

// after a change, mark related data stale so it refetches
useMutation({ mutationFn: surveysApi.publish, onSuccess: () => qc.invalidateQueries({ queryKey: ["surveys"] }) })

// keep showing page 1 while page 2 loads (no flicker)
placeholderData: keepPreviousData
```

**Interview questions**
- *Server state vs client state?* Server state belongs to the backend and can go stale (surveys, results). Client state is only in the browser (which checkbox is ticked). React Query handles the first kind.
- *How does the results page update by itself?* `refetchInterval` returns 3000 ms while `pending_responses > 0` and `false` once it's 0.

---

## 19. axios (HTTP client with interceptors)

**What it is.** An HTTP client. **Interceptors** run on every request or response.

**Where.** `src/api/client.ts`.

**What the interceptors do**
1. **Request**: attach `Authorization: Bearer <in-memory token>`.
2. **Response**: on a 401 (not from `/auth/*`), call `/auth/refresh` **once**, even if 5 requests failed together (they share one `refreshing` promise), then retry the original request. If refresh fails, go to `/login`.

`errorMessage()` turns any DRF error shape (`{"detail": …}`, field errors, 429) into one readable sentence for toasts.

**Interview question.** *Why share one refresh promise?* Without it, five parallel 401s fire five refreshes. With rotation, four would use an already-blacklisted token and fail.

---

## 20. React Hook Form + Zod

**What it is.** React Hook Form manages form state with few re-renders. Zod describes a schema once and gives you both validation and a TypeScript type (`z.infer`).

**Where.** `components/SurveyBuilder.tsx` (nested `useFieldArray` for questions → options), `components/surveySchema.ts`, and the login and register forms.

**Mirrors the backend limits**: 1–20 questions, 2–10 options, unique option text ignoring case and spaces (`" gold "` equals `"Gold"`). The error attaches to the exact duplicate field. Tested in `surveySchema.test.ts`.

**Interview question.** *If the backend validates, why validate in the browser too?* Instant feedback for the user. The **backend stays the authority**, because client checks can be bypassed.

---

## 21. Tailwind CSS

**What it is.** Utility-first CSS: style with small classes (`px-4 py-2 rounded`) instead of writing stylesheets.

**Where.** `tailwind.config.ts` holds the design tokens: `paper`, `ink`, `marigold` (result bars), `sage` (success), `brick` (danger), and the Schibsted Grotesk font. `src/index.css` defines a few reusable classes (`.btn-primary`, `.input`, `.panel`) with `@apply`.

**Interview question.** *Downside of Tailwind?* Long class lists in markup. Mitigate with components and a few `@apply` classes, which is what this repo does.

---

## 22. Recharts

**What it is.** React chart components built on SVG.

**Where.** `components/ResultsChart.tsx` (horizontal bars per question), `components/DashboardView.tsx` (six-month activity bars).

**Detail worth mentioning.** Bars are drawn against a fixed 0–100 scale (percent of participants), so bar length matches the label. On multi-select questions the percentages can add up to more than 100%, and the UI says so. There's also a hidden table (`ResultsTable`) so screen readers get the numbers.

---

# Testing and quality

## 23. pytest, pytest-django, factory-boy

**What they are.** pytest is the test runner (plain `assert`, fixtures). pytest-django adds `@pytest.mark.django_db` and a test database. factory-boy builds model objects (`VerifiedInvestorFactory()`).

**Where.** `backend/tests/` holds 70 tests against **real PostgreSQL**, not SQLite, because we rely on Postgres-only features.

**Techniques worth explaining**
- `django_capture_on_commit_callbacks(execute=True)`: normal tests run inside a transaction that never commits, so `on_commit` callbacks would never fire. This fixture runs them.
- `@pytest.mark.django_db(transaction=True)` + threads: the concurrency tests use real commits and separate connections to prove `SKIP LOCKED` works.
- `monkeypatch` to fake S3 (`fake_storage` fixture), so tests need no network.
- `CELERY_TASK_ALWAYS_EAGER = True`: tasks run inline in tests.
- A fast MD5 password hasher **in tests only** took the suite from 45 s to about 3 s.

**Interview question.** *How did you test concurrency?* Hold row locks in the main thread, then have a second thread run the aggregation. It returns 0 rows, proving it skipped the locked batch. A second test runs 4 workers at once on 30 responses and checks the total is exactly 30.

## 24. Vitest + React Testing Library

**What they are.** Vitest is a Vite-native test runner with a Jest-like API. Testing Library renders components and queries them the way a user would (`getByText`).

**Where.** `frontend/src/auth/guards.test.tsx`, `frontend/src/components/surveySchema.test.ts`. Run with `npm test`.

## 25. ruff, oxlint, pip-audit, npm audit

- **ruff**: a very fast Python linter and formatter (`backend/ruff.toml`). It catches unused imports, bugs and import order.
- **oxlint**: a fast JavaScript/TypeScript linter.
- **pip-audit** and **npm audit**: check dependencies against known-vulnerability databases. This is how the React Router advisory was caught and fixed.

---

# DevOps

## 26. Docker and Docker Compose

**What they are.** Docker packages an app with its exact runtime into an image. Compose starts several containers together with one command.

**Where.** `backend/Dockerfile`, `docker-compose.yml`.

**Things to point at**
- `db` has a **healthcheck** (`pg_isready`), and `web` / `worker` / `beat` wait for `condition: service_healthy`, so the API doesn't start before Postgres accepts connections.
- `minio-setup` is a one-shot container that creates the bucket.
- The same image runs as three different processes (`web`, `worker`, `beat`) with different commands.
- Inside Compose, services reach each other by name (`db`, `redis`, `minio`).

**Interview question.** *Why separate containers for worker and beat?* They scale independently: run many workers but exactly one beat.

## 27. GitHub Actions (CI)

**What it is.** Runs automated checks on every push and pull request.

**Where.** `.github/workflows/ci.yml`, with two parallel jobs:
- **backend**: Postgres 16 and Redis 7 as service containers → `ruff` → `makemigrations --check` (fails if a migration is missing) → `manage.py check` → `pytest` → `pip-audit`
- **frontend**: `npm ci` → `oxlint` → `tsc` + `vite build` → `vitest` → `npm audit`

---

# System-design questions you can now answer

1. **"How do you guarantee one vote per investor?"** A unique `(survey, user)` constraint in Postgres, with the violation mapped to 409. An application-level check alone loses races.
2. **"How would this scale to 10 million responses?"** Writes are cheap inserts. Reads only hit small pre-computed tables. Add more Celery workers (`SKIP LOCKED` lets them share work). Partial indexes keep the "unprocessed" lookup tiny.
3. **"What's eventually consistent here, and how does the user know?"** Results lag a few seconds behind submissions. `pending_responses` tells the UI, which shows "N responses are still being counted" and polls.
4. **"A worker died halfway through. What breaks?"** Nothing. The batch transaction rolls back, `acks_late` redelivers the task, and the sweeper is a backstop. Idempotency makes retries safe.
5. **"Why can't anyone edit a published survey?"** Editing questions after people answered would make the collected answers and counts meaningless.
6. **"How is the public dashboard link secured?"** A 256-bit random token (not derived from IDs), revocable and optionally expiring, rate-limited. It returns aggregates only, never email or answers. Missing, revoked and expired links all give the same 404, so attackers learn nothing.
7. **"Where could XSS hurt you, and what limits it?"** React escapes text by default. The access token is only in memory and short-lived, and the refresh token is httpOnly.

---

## Suggested study order (about a week)

1. Day 1: Django models and migrations, then the ORM patterns table (§2–3). Open `surveys/models.py` and `submissions/models.py`.
2. Day 2: DRF pipeline, serializers, permissions (§4). Walk through `surveys/views.py` top to bottom.
3. Day 3: Postgres constraints, indexes, upsert, `SKIP LOCKED` (§5). Re-read `stats/tasks.py` until you can explain every line.
4. Day 4: JWT and cookies, CORS (§7–8). Trace `api/client.ts` together with `accounts/views.py`.
5. Day 5: Celery, Redis and the four correctness properties (§9). Presigned uploads (§10).
6. Day 6: React, React Query, forms (§14–20).
7. Day 7: Tests, Docker, CI (§23–27). Then practise the system-design answers out loud.

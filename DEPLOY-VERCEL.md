# Deploy to Vercel (API + scol-admin)

Use **two Vercel projects** from this repo.

## 1. Backend API

| Setting | Value |
|---------|--------|
| Root Directory | `.` (repository root) |
| Framework | Other |
| Build Command | `npm run vercel-build` (from `vercel.json`; do **not** override with plain `npm run build` unless install includes dev deps) |
| Install Command | `npm install --include=dev` (required so `@nestjs/cli` is available — Vercel sets `NODE_ENV=production` during build) |
| Output | Serverless `api/index.js` + compiled `dist/` |

In the Vercel dashboard, clear any custom **Build Command** that only runs `npm run build` without matching `vercel.json`, or set it explicitly to `npm run vercel-build`.

### Required environment variables

Set in Vercel → Project → Settings → Environment Variables:

`NODE_ENV` is `production` on Vercel at runtime automatically. Install uses `--include=dev` so Nest can compile (do not rely on omitting devDependencies).

```env
APP_STAGE=prod
DATABASE_URL=postgresql://...?sslmode=require
JWT_ACCESS_SECRET=<32+ chars>
JWT_REFRESH_SECRET=<32+ chars>
JWT_OTP_SECRET=<32+ chars>
JWT_ISSUER=scol-api
CORS_ORIGINS=https://your-admin.vercel.app
JOBS_ENABLED=false
TRUST_PROXY_HOPS=1
```

Optional but recommended for data-admin:

```env
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
DATA_ENTRY_CLOUD_ROOT=SCOL_DATA
REDIS_URL=rediss://...   # optional; in-memory fallback if omitted
```

Run DB migrations **locally or CI** against production DB (Vercel does not run `typeorm:run` on deploy):

```powershell
npm run typeorm:run
npm run seed:admin
```

### Smoke test

- `GET https://<api-host>/health` → `status: ok`
- `GET https://<api-host>/swagger` → Swagger UI

---

## 2. Frontend (scol-admin)

| Setting | Value |
|---------|--------|
| Root Directory | **`scol-admin`** (required — separate Vercel project from API) |
| Framework | Vite |
| Install Command | `npm ci --include=dev \|\| npm install --include=dev` (from `scol-admin/vercel.json`) |
| Build Command | `npm run vercel-build` |
| Output Directory | `dist` |

Do not deploy the admin from the API project root; `/.vercelignore` excludes `scol-admin/` from the backend upload.

### Environment variables

```env
VITE_API_BASE_URL=https://<api-host>
```

No `/api` suffix — the admin calls `/auth/...`, `/data-entry/...` on that host directly.

Redeploy the admin after changing `VITE_API_BASE_URL` (baked in at build time).

---

## Local build check

```powershell
cd scol-backend
npm run build

cd scol-admin
npm run build
```

Both must exit 0 before deploying.

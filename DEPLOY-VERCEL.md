# Deploy to Vercel (API + scol-admin)

Use **two Vercel projects** from this repo.

## 1. Backend API

| Setting | Value |
|---------|--------|
| Root Directory | `.` (repository root) |
| Framework | Other |
| Build Command | `npm run vercel-build` (from `vercel.json`) |
| Output | Serverless `api/index.js` + compiled `dist/` |

### Required environment variables

Set in Vercel → Project → Settings → Environment Variables:

```env
NODE_ENV=production
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
| Root Directory | `scol-admin` |
| Framework | Vite (auto-detected) |
| Build Command | `npm run build` |
| Output Directory | `dist` |

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

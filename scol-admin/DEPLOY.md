# Deploy scol-admin on Vercel

## Required project settings

Create a **separate** Vercel project (not the API project).

| Setting | Value |
|---------|--------|
| **Root Directory** | `scol-admin` |
| **Framework Preset** | Vite |
| **Build Command** | `npm run vercel-build` (or leave default if `vercel.json` is used) |
| **Output Directory** | `dist` |
| **Install Command** | `npm ci --include=dev \|\| npm install --include=dev` |

If **Root Directory** is `.` (repo root), Vercel will install the **Nest API** (`supertest`, `multer` in logs) and will **not** produce `scol-admin/dist/index.html` → *No Output Directory named "dist"*.

## Environment variables

```env
VITE_API_BASE_URL=https://your-api.vercel.app
```

Redeploy after changing any `VITE_*` variable.

## Env on the API project

```env
CORS_ORIGINS=https://your-admin.vercel.app
```

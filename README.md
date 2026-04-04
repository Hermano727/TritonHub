# TritonHub

Monorepo-style layout: **Next.js app** in [`frontend/`](frontend/), **Python services** in [`services/`](services/).

## Frontend (Next.js)

All npm scripts live in [`frontend/package.json`](frontend/package.json). Run everything from `frontend/`:

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Other scripts: `npm run build`, `npm run start`, `npm run lint`.

### Deploy (Vercel)

Set the Vercel project **Root Directory** to `frontend` so builds use the Next.js app.

## Backend (scaffold)

See [`services/api/README.md`](services/api/README.md) for the FastAPI health check service.

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)

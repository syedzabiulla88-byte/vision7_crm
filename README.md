# Vision7 CRM — Master Control Plane

The single pane of glass for the Vision7 business: the fresh-rebuild successor to
the legacy `site/admin` business-admin surface, plus a cross-app control plane
(centralized users, dynamic roles/permissions, system settings, and read-only
surfacing + deep-links into the `platform` club-management app).

- **Domain (prod):** `crm.vision7.sa`
- **Stack:** Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind v4 + shadcn/ui · sonner
- **Backend:** shared NestJS API at `https://api.vision7.sa/api` (no app-to-app traffic; auth = JWT Bearer)
- **Token key:** `vision7_crm_token` / `vision7_crm_user` (never collides with site's
  `vision7_admin_token` or platform's `vision7_token` on `*.vision7.sa`)

This repo mirrors the proven `platform/` TypeScript stack so the two control
surfaces share idioms (config, UI kit, auth providers copied near-verbatim).

## Run locally

The site (`:3000`) and platform (`:3001`) coexist, so run the CRM on **port 3002**:

```bash
npm install
npm run dev -- -p 3002        # http://localhost:3002
```

It points at the **shared** backend (`NEXT_PUBLIC_API_URL`, default
`https://api.vision7.sa/api`). Never point dev at the prod RDS — it only talks
HTTP to `api.vision7.sa`. To run against a local backend, set
`NEXT_PUBLIC_API_URL=http://localhost:4000/api` in `.env.local`.

## Auth

- Own admin login (separate token, reuses the existing JWT backend — **no SSO**).
- **Admit by capability, not hardcoded role:** login is accepted if the user's
  resolved `permissions[]` (from `GET /auth/profile`) includes `'*'` or
  intersects the business permission set; pure member/athlete/parent accounts
  (empty perms) are rejected.
- `middleware.ts` mirrors the token into a non-HttpOnly `vision7_crm_token`
  cookie so the edge guard can redirect unauthenticated requests to `/login`.

## Project status

Phase 0 (scaffold) + Phase 1 (auth + app shell + IA/nav). Feature pages under
the dashboard are **placeholders** — the real ports (CRM, members, bookings,
billing, reports, control plane) land in Phase 2+. See `../CRM_HUB_PLAN.md`.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Dev server (add `-- -p 3002`) |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |

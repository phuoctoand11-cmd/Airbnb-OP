# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifacts

### `artifacts/admin` — Airbnb Operations Admin (web, React + Vite)

A role-based admin dashboard for managing short-term rental operations. Backed entirely by **Supabase** (Postgres + Auth + Storage); no API server required.

- **Frontend**: React 18 + Vite + Tailwind v4 + shadcn/ui + wouter + react-query + react-hook-form + zod + recharts + date-fns + lucide-react
- **Auth**: Supabase email/password. Public anon key only on the client. RLS enforces all access.
- **Env**: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are exposed to Vite via `vite.config.ts` `define` as `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
- **Database schema**: `artifacts/admin/supabase/schema.sql` — must be executed once in the Supabase SQL editor before first use. Creates enums, profiles (with auto-trigger from `auth.users`), listings, listing_images, amenities, listing_amenities, calendar_entries, pricing_rules, bookings, tasks, revenues, expenses, RLS policies, the `listing-images` storage bucket, and seed amenities.
- **Roles & permissions** (in `src/lib/auth-context.tsx`):
  - `admin` — everything, including team management
  - `manager` — listings, bookings, tasks, finance, reports
  - `staff` — tasks only
  - `accountant` — finance + reports
- **Pages**: `/login`, `/dashboard`, `/listings`, `/listings/:id` (overview/images/amenities/calendar/pricing tabs), `/bookings`, `/tasks` (kanban), `/revenues`, `/expenses`, `/reports`, `/settings/users`
- **Storage**: `listing-images` bucket; uploads stored at `${listingId}/${uuid}-${file.name}`, public URL stored in `listing_images.url`.

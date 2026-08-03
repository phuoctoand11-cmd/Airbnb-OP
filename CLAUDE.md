# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ Read `PROJECT_CONTEXT.md` first

Before changing anything related to the database, roles, or auth, read **`PROJECT_CONTEXT.md`** (Vietnamese) in the repo root. It is the living handoff doc for this project and contains the authoritative rules. Highlights (see the file for full detail):

- **Never create a duplicate table.** There are already ~40 tables. Check before adding one, especially anything for identity (`users`/`employees`/`profiles`) or calendars (`listing_calendar`/`calendar_entries`/`listing_blocks` — three parallel calendar tables exist as known tech debt; do not "clean this up" unasked).
- **Roles are a fixed set of 6, spelled exactly:** `admin`, `manager`, `sales`, `cleaner`, `maintenance`, `accountant`. No variants (`sale`, `cleaningstaff`, `staff`, `reception`). `sales` also owns check-in/check-out.
- **Role source of truth is `users` + `roles`** (via `users.role_id`), not `profiles`. `profiles` is legacy but still FK'd from `employees` and read directly by frontend code — don't drop or rename it without checking every `.from("profiles")` call first.
- **Creating an auth user via SQL requires 4 pieces in one transaction**: `auth.users` (with `email_confirmed_at`), empty-string (never NULL) token columns (`confirmation_token`, `recovery_token`, `email_change`, `email_change_token_new`), an `auth.identities` row, and a `profiles` row. This is already wrapped in the `admin_create_employee(...)` Postgres RPC — use that instead of inserting into `auth.users` directly.
- **Dates: use `T12:00:00` (noon), never `T00:00:00`.** The app is VN (UTC+7); midnight rolls back a day once converted to UTC, which silently corrupts day-based reports.
- **`upsert(..., { onConflict })` needs a matching UNIQUE constraint** on those columns or it silently no-ops. Known constraints: `payments(booking_id, payment_type)`, `revenues(booking_id, category)`, `listing_calendar(listing_id, date)`.
- **`employees.role` (text) must match `roles.name` exactly** — don't hand-enter Vietnamese labels; task filtering depends on the canonical value.
- Before dropping/renaming a table, grep the whole codebase for `.from("table_name")` first, and ask the project owner (non-technical; explain in plain language, one step at a time, confirm before proceeding).
- Known code↔DB drift to be aware of (don't silently "fix" — confirm first): `AppRole` in `artifacts/admin/src/lib/supabase.ts` still lists `cleaningstaff`/`staff` (removed from the DB `roles` table); `ListingCalStatus` there includes `owner_stay`/`cleaning_hold`, which aren't in the DB's `calendar_status` enum.

## Repository structure

This is a **pnpm workspace monorepo** (Node 24, TypeScript 5.9, pnpm — `preinstall` hard-fails if you use npm/yarn). Workspace packages live under `artifacts/*` (deployable apps) and `lib/*` (shared libraries), declared in `pnpm-workspace.yaml`.

```
artifacts/
  admin/          @workspace/admin        — the real product: Airbnb/villa ops admin dashboard
  devtools/       @workspace/devtools      — standalone client-side dev tools site
  mockup-sandbox/                          — design-mockup preview sandbox
  api-server/     @workspace/api-server    — Express 5 API scaffold (Drizzle/Postgres), NOT used by admin
lib/
  db/             @workspace/db            — Drizzle ORM schema/client for api-server
  api-spec/       @workspace/api-spec      — OpenAPI spec + Orval codegen config
  api-zod/        @workspace/api-zod       — Zod schemas generated from the OpenAPI spec
  api-client-react/ @workspace/api-client-react — react-query hooks generated from the OpenAPI spec
scripts/          @workspace/scripts       — misc workspace scripts (postMerge hook, etc.)
```

**Important architectural split:** there are two independent backends in this repo, and only one is actually wired up.

1. **`artifacts/admin` talks directly to Supabase** (Postgres + Auth + Storage) using `@supabase/supabase-js` with the public anon key; Row-Level Security enforces all authorization. There is no API server in this path.
2. **`artifacts/api-server` + `lib/db` + `lib/api-spec` + `lib/api-zod` + `lib/api-client-react`** form a separate, largely dormant scaffold: an OpenAPI spec (`lib/api-spec/openapi.yaml`) is fed through Orval to generate Zod schemas and react-query hooks, and `lib/db` defines a Drizzle schema for a Postgres-backed Express API. This is not the villa-ops product and should not be assumed to be consumed by `artifacts/admin`.

When asked to change "the app", it almost always means `artifacts/admin`.

## Commands

Run everything from the repo root unless noted.

```bash
pnpm install                      # install (pnpm required; npm/yarn are blocked by preinstall)
pnpm run typecheck                # tsc --build on lib/* + typecheck on artifacts/** and scripts
pnpm run build                    # typecheck, then build every package that has a build script

# Admin app (artifacts/admin) — the product
pnpm --filter @workspace/admin run dev       # vite dev server, host 0.0.0.0
pnpm --filter @workspace/admin run build     # vite build -> dist/public
pnpm --filter @workspace/admin run typecheck # tsc --noEmit

# Devtools app
pnpm --filter @workspace/devtools run dev
pnpm --filter @workspace/devtools run build

# API scaffold (rarely touched — see architecture note above)
pnpm --filter @workspace/api-server run dev       # build then run dist/index.mjs
pnpm --filter db run push                         # drizzle-kit push (needs DATABASE_URL)
pnpm --filter @workspace/api-spec run codegen      # regenerate Zod schemas + react-query hooks from openapi.yaml
```

There is no configured test runner (`pnpm test` does not exist) and no lint script in `package.json` — don't invent one; typecheck is the available correctness gate. Confirm with the user before adding a test framework or linter.

### Database changes (Supabase, i.e. the real product)

There is no migration tool for `artifacts/admin`'s Supabase project — `artifacts/admin/supabase/schema.sql` is the base schema (run once in the Supabase SQL editor), and everything since is a hand-written, hand-run `*_migration.sql` file in that same directory. When a DB change is needed:

- Write the SQL as a new `*_migration.sql` file in `artifacts/admin/supabase/`, and give it to the user to paste into the Supabase SQL editor themselves (per the Golden Rules above, AI does not have write access to the DB).
- Check existing tables/enums/constraints first (use `pg_constraint` for foreign keys — `information_schema` has been observed to miss FKs here).

## Admin app (`artifacts/admin`) architecture

Role-based single-page dashboard for managing short-term rental (Airbnb/Booking.com) operations: listings, calendar/availability, bookings, tasks, revenues/expenses, HR, chat, performance, reports.

- **Stack**: React 18 + Vite + Tailwind v4 + shadcn/ui (`src/components/ui`) + wouter (routing) + react-query + react-hook-form + zod + recharts + date-fns + lucide-react.
- **Entry/routing**: `src/App.tsx` wires `QueryClientProvider` → `I18nProvider` → `CurrencyProvider` → `AuthProvider` → wouter `Router`. Routes are wrapped in `<ProtectedRoute permission="...">` (see `src/components/layout/ProtectedRoute.tsx`), gated by the `Permission` keys defined in `src/lib/role-permissions.ts`.
- **Auth & authorization**: `src/lib/auth-context.tsx` holds the Supabase session + resolved role; `src/lib/role-permissions.ts` maps each `Permission` to the roles allowed to use it; `getDefaultRouteByRole` sends a user to the right landing page post-login. Roles: `admin`, `manager`, `sales`, `accountant`, `cleaner`, `maintenance`, plus a view-only `collaborator` role. Anything gating a page/action should go through `hasPermission` / `ProtectedRoute`, not ad-hoc role checks.
- **Data access**: all reads/writes go through the shared Supabase client in `src/lib/supabase.ts`, which also defines the domain types (`Listing`, `Booking`, `Task`, `Payment`, `Revenue`, `Employee`, chat types, etc.) mirroring the DB schema. There is no separate API/service layer — pages call `supabase.from(...)`/`supabase.rpc(...)` directly.
- **i18n**: `src/i18n/` implements a from-scratch (no library) EN/VI dictionary system — `en.ts`/`vi.ts` export a `Translations` object, `I18nProvider`/`useI18n()` in `index.ts` supply `t` and persist the chosen language to `localStorage`. Vietnamese (`vi`) is the default for new sessions. New user-facing strings must be added to both `en.ts` and `vi.ts`.
- **Currency**: `src/lib/currency.tsx` provides a `CurrencyProvider`/formatting context used throughout finance-related pages.
- **Storage**: uploaded listing images go to the `listing-images` Supabase Storage bucket at `${listingId}/${uuid}-${file.name}`; the public URL is persisted on `listing_images.url`.
- **Env vars**: `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (server-side env at build time) are threaded into the client bundle via `vite.config.ts`'s `define`, exposed to app code as `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. `vite.config.ts` also falls back to a hardcoded dev project if those are unset — don't rely on that fallback for anything but local dev.
- **Path aliases**: `@` → `artifacts/admin/src`, `@assets` → `attached_assets/` (repo root).

## Devtools app (`artifacts/devtools`)

A fully client-side toolkit of ~18 independent utility pages (JSON formatter, Base64, URL encode/decode, JWT decoder, UUID generator, hash generator, timestamp converter, color converter, regex tester, markdown preview, text diff, lorem ipsum, case converter, cron explainer, query string tool, code beautifier/minifier, QR code generator, number base converter). No backend, no auth, no network calls — every tool is a self-contained routed page under `src/pages` using wouter, styled with the same shadcn/ui + Tailwind v4 stack as admin, with a custom dark/light `ThemeProvider` persisted to `localStorage`. Add new tools as a new routed page rather than extending an existing one.

## Conventions

- **Package manager is pnpm only.** The root `preinstall` script deletes `package-lock.json`/`yarn.lock` and fails the install if invoked via npm/yarn.
- Shared/pinned dependency versions live in the `catalog:` block of `pnpm-workspace.yaml` — reference them as `"catalog:"` in a package's `package.json` rather than hardcoding a version, when the dependency is already cataloged.
- This is a **Replit-hosted** project (`.replit`, Replit Vite plugins in `admin`/`devtools`/`mockup-sandbox`). `scripts/post-merge.sh` (wired via `.replit`'s `[postMerge]`) runs `pnpm install --frozen-lockfile && pnpm --filter db push` after merges.
- `DESIGN.md` at the repo root is an unrelated design-token reference (a Clay.com-style design system spec) used for mockup/design generation — it is not this product's design system and shouldn't be treated as UI guidance for `admin` or `devtools`.

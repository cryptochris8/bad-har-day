# bad-hair-day

Web app project. _(stack context wired by Builder Hub, 2026-09-26)_

_Claude Code reads this file automatically._

## Tools & stacks available to me
- **Full tool catalog** — every tool / service / API / app I use, with versions and where each API key lives: `C:\Users\chris\TOOL-STACK.md`. Read it before choosing a tool or scoping work, and **prefer tools I already have**.
- **Stack profiles** — focused tool set + conventions per project type: `C:\Users\chris\.claude\stack-profiles`.
- **All my other projects** — the Builder Hub registry (name → path · type · stack · notes): `C:\Users\chris\.claude\builder-hub-projects.md` (auto-managed). When I mention another project, resolve it there — you may read those folders directly.
- This project's type is **Web app** — its profile is inlined below.

---

# Profile: Web app / SaaS / dashboard

**Use when:** building a web app, SaaS, dashboard, or content site that needs a build step.

## Default stack (focused)
- **Framework:** **Next.js** (App Router) for full-stack/SSR SaaS; **Vite + React** for SPAs and 3D/game UIs.
- **UI:** React 19, TypeScript, **Tailwind + shadcn/ui** (Radix primitives). Icons `lucide-react`, charts `Recharts`.
- **State/forms:** Zustand; `react-hook-form` + **Zod**.

## Backend / data (pick per need)
- **Supabase** (Postgres + Auth + Storage) — fastest all-in-one.
- **Neon** (serverless Postgres) + **Prisma** or **Drizzle** — when you want your own ORM.
- **Firebase** — when you need realtime + tight mobile integration.
- **Upstash Redis** — rate-limiting / caching. **Inngest** — background jobs / cron / events.

## Cross-cutting services
- **Auth:** Clerk (orgs/MFA/RBAC) · or Supabase/Firebase Auth.
- **Payments:** Stripe (web). **Email:** Resend. **SMS:** Twilio. **Video:** Daily.co.
- **Monitoring:** Sentry. **Hosting:** Vercel (Next SaaS) or Netlify (static/SSR).

## Conventions (learned the hard way)
- **Never** put a secret in a `NEXT_PUBLIC_*` var — it's inlined into the client bundle. Secrets are server-only. (This bit FounderOS — see security TODOs.)
- **pnpm** for monorepos (workspaces). Tests: **Vitest** (+ Testing Library); E2E: **Playwright**.

## Reference projects on disk
`New-apps/*` (building-compliance-os, cashpilot, freight-verify — modern Next 16 + shadcn + Stripe + Sentry) · `Overtime-Care` (HIPAA pnpm monorepo, Prisma/AWS/Terraform) · `MA-Training` (Vite SPA).

---

## This project
**BAD HAIR DAY!** — a procedural 3D browser family arcade game about one school morning (5:15 → ~8:05 AM in
10–20 minutes): Chris, Ashley, Addy, Ellie, Heidi and the dog; chores, wake-up, THE BLACK BRUSH + Mom's hair check,
the rush out the door, the school run, the Morning Report Card. Vite + TypeScript + Three.js, every model and sound
procedural, no backend. Fourth game in the MAILBOX MAYHEM / TRASH PANDA TROUBLE / ATHLETE MAYHEM format (those repos are
read-only references). The web-app profile above is general context only: no Next.js or UI framework here.
- Design: `docs/GDD.md` (§0 tone rules!). Module contracts, ownership, conventions: `docs/ARCHITECTURE.md`. Overview: `README.md`.
- Commands: `npm run dev` (:5190) · `npm run build` · `npm test` (Vitest) · `npm run test:e2e` (Playwright).
- Jump in: `/?test=1&act=1..5` or `/?test=1&activity=dog|coffee|lunch|trash|dishes|wake|hair|rush|drive` (`&seed=N`).
  Debug hooks: `window.__BHD__` (src/game/debug.ts), incl. `autopilot(true)` to play a whole morning by itself.
- Screenshots: `node tools/shot.mjs "/?test=1&act=3" shots/x.png --until "window.__BHD__ && window.__BHD__.act()===3"`;
  walkthroughs: `node tools/walk.mjs "<url>" shots/w <steps…>` (steps documented in the file header).
- GitHub: https://github.com/cryptochris8/bad-har-day (main).
- Live at https://bad-hair-day.netlify.app (Netlify site `bad-hair-day`, team HySports, deployed from the CLI; this
  folder is linked, no GitHub auto-deploys). Redeploy with `netlify deploy --build --prod`, **only with Chris's
  explicit approval each time** (deploy a clean, fully tested commit — not a working tree with in-progress edits).

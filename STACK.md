# STACK.md — the golden path

> Drop this into a new repo (rename to `AGENTS.md` / `CLAUDE.md` if you want the agent to read it
> automatically). It encodes a preferred stack, the idiomatic way to use it, and the specific
> mistakes that have cost real hours before — so they don't get repeated.
>
> Philosophy: **one obvious choice per job.** Boring, well-documented, types-first, fast local
> loop, deploys to Vercel in one push. Optimize for "still understandable at 2am during a hackathon."

---

## 0. Hard constraints (read this first, every time)

These are the things that get rediscovered the hard way. Treat them as non-negotiable defaults.

```
- Package manager / runtime: bun. Never npm/yarn/pnpm. Never `node` to run scripts — use `bun`.
- DB access: the ORM only (Drizzle). Never raw `psql` for app logic or one-off scripts.
- The dev server is usually ALREADY RUNNING. Don't `bun run build` to "test" a change —
  use the running dev server. Build is for verifying the production bundle, not for iterating.
- Server-only code (DB, secrets, node APIs) lives behind `createServerFn` in its OWN file.
  Never import server modules into a file that also renders a component — it leaks into the
  client bundle ("Buffer is not defined", "process is not defined", etc.).
- TanStack API routes use `createFileRoute` + `server.handlers`. `createAPIFileRoute` does NOT
  exist in current TanStack Start — code using it silently never registers.
- Serverless (Vercel functions) has NO git binary and NO arbitrary outbound sockets. Do not shell
  out to `git`, `ssh`, or bind ports. Anything like that runs in a real container or as a job.
- "It broke recently" → `git log -p -- <suspect-file>` BEFORE reading any node_modules internals.
- A change is NOT done until the real code path has run and been observed (a request, a render,
  a row in the DB). Typecheck + build passing ≠ feature working. Say so if you can't verify.
- After ~3 failed greps for a symbol in node_modules, "it doesn't exist" IS the answer.
  Go to the official docs (context7) instead of widening the search.
```

---

## 1. The stack at a glance

| Job | Choice | Why |
|---|---|---|
| Runtime + package manager | **Bun** | One tool: install, run, test, bundle. Fast. `bunx` for one-offs. |
| Framework | **TanStack Start** (Vite + React + SSR) | Type-safe routing, loaders, server fns, RSC-free mental model. |
| Language | **TypeScript**, `strict: true` | Non-negotiable. |
| Styling | **Tailwind CSS v4** | v4 config is CSS-first (`@theme`), no `tailwind.config.js` needed. |
| UI primitives | **shadcn/ui** (Radix under the hood) | Copy-in components you own; not a black-box dep. |
| Icons | **lucide-react** | Consistent, tree-shakeable. |
| ORM | **Drizzle** + **postgres.js** | Typed SQL, migrations, no codegen daemon. |
| Database | **Postgres** (Neon / Supabase / Aiven) | Branching on Neon is great for preview deploys. |
| Auth | **BetterAuth** | DB-backed sessions, email/pass + OAuth, escape hatches when you need them. |
| Validation | **Zod** | Schemas for input, env, API boundaries. One validation language everywhere. |
| Server state | **TanStack Query** | When you outgrow loaders for client-driven data. |
| Forms | **TanStack Form** or **react-hook-form** + Zod | Either; pick one per project and stick to it. |
| Realtime / local-first | **InstantDB** | Optional. Great for collaborative/live UI. (Bundler caveat below.) |
| Email | **Resend** + **react-email** | Typed templates, one API call. |
| Payments | **Stripe** | Obviously. Use the hosted Checkout unless you have a reason not to. |
| File uploads | **UploadThing** or S3-compatible (R2) | UploadThing for speed; R2 when you want to own it. |
| Background jobs / cron | **Inngest** or **Trigger.dev** | For anything that can't run inside a request. |
| AI / LLM | **`@anthropic-ai/sdk`** | Default to the latest Claude model family (see §8). |
| Lint + format | **Biome** | One fast binary replacing ESLint + Prettier. Bun-friendly. |
| Tests | **Vitest** (unit) + **Playwright** (e2e) | Vitest shares Vite config; Playwright for real-browser checks. |
| Env validation | **`@t3-oss/env-core`** + Zod | Crash at boot on missing/!valid env, not at 2am in prod. |
| Deploy | **Vercel** | One push. Preview deploys per PR. (Non-Vercel: Bun server, see §5.) |
| Analytics | **Vercel Analytics** / **PostHog** | Vercel for web vitals; PostHog when you want events + flags. |

If a need isn't on this list, the rule is: pick the option with the best docs and the most boring
reputation, then add it here for next time.

---

## 2. Getting started (cold start in <5 min)

```bash
# scaffold (or `bun create` a TanStack Start template, then prune)
bun install

# env — copy and fill. Never commit .env. Always keep .env.example in sync.
cp .env.example .env

# dev: TanStack Start dev server (Vite). Leave it running.
bun run dev

# typecheck (run this constantly; it's your fastest real signal)
bunx tsc --noEmit

# db: push schema in dev, generate+migrate for anything shared/prod
bunx drizzle-kit push        # dev iteration
# bunx drizzle-kit generate  # when you want migration files in history
# bunx drizzle-kit migrate   # apply migrations (prod / teammates)

# format + lint
bunx biome check --write .
```

`package.json` scripts worth standardizing:

```jsonc
{
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "start": "node .output/server/index.mjs",   // or bun, see §5
    "typecheck": "tsc --noEmit",
    "check": "biome check --write .",
    "db:push": "drizzle-kit push",
    "db:gen": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "test": "vitest",
    "e2e": "playwright test"
  }
}
```

---

## 3. TanStack Start — the patterns that are correct (and the traps)

TanStack Start is great but has a few sharp edges that have each cost hours. Internalize these.

### 3.1 Data loading: loaders + `beforeLoad`, NOT `useEffect`

```typescript
export const Route = createFileRoute('/dashboard')({
  // Auth guard — runs on the server, throws redirect BEFORE render. No flash of unauth UI.
  beforeLoad: async () => {
    const session = await getAuthSession()
    if (!session?.user) throw redirect({ to: '/' })
  },
  // Data — runs on server, available synchronously in the component. No loading spinner needed.
  loader: async () => ({ items: await getItems() }),
  component: Dashboard,
})

function Dashboard() {
  const { items } = Route.useLoaderData()   // already here, typed
}
```

Reach for `useEffect`/TanStack Query only for genuinely client-driven data (depends on
`localStorage`, on-demand fetches, things you can't or shouldn't dedupe in a loader).

### 3.2 API routes: `createFileRoute` + `server.handlers`

```typescript
// src/routes/api/thing.ts
export const Route = createFileRoute('/api/thing')({
  server: {
    handlers: {
      GET: async ({ request }) => Response.json({ ok: true }),
      POST: async ({ request }) => { /* ... */ },
    },
  },
})
```

**TRAP:** `createAPIFileRoute` from `@tanstack/react-start/api` looks right and is all over old
blog posts — it does **not** exist in current versions. Files using it never register; every
request falls through to the HTML shell and you get cryptic *"Only HTML requests are supported
here"* errors. If an endpoint returns your index HTML instead of JSON, this is why.

### 3.3 Server-only logic: `createServerFn` in a SEPARATE file

This is the single most expensive TanStack trap. Server functions are the right abstraction for
logic shared between loaders and client event handlers:

```typescript
// src/server/items.ts   <-- its own file, no React component in here
import { createServerFn } from '@tanstack/react-start'

export const getItems = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getAuthSession()        // DB, secrets, node APIs — all fine here
  return db.select().from(items).where(eq(items.userId, session.user.id))
})
```

**TRAP — "Buffer is not defined" / "process is not defined" / a server lib in your client bundle:**
this happens when server-only code is imported (even transitively, even via a type) into a file
that also exports a `component`. The bundler can't always tree-shake it out, so it ships to the
browser. Fixes that do NOT work: dynamic `import()` inside the loader, `tsconfig` path tricks.
The fix that DOES work: **move the server code into its own module** that the component never
imports — only the `createServerFn` boundary crosses over.

### 3.4 Regenerate the route tree

After adding/moving routes, the generated tree must update. The dev server usually does it, but if
a route "exists but 404s" or a new API route isn't found, run the generator (`tsr generate` /
your configured route-gen step) and check `routeTree.gen.ts` actually contains it. A route that
isn't in that file does not exist as far as the router is concerned.

### 3.5 Prefer the framework mechanism over a clever shim

Every time a Vite middleware / monkey-patch was used to paper over one of the above, it created a
*second* bug and a misleading note in the docs that had to be unwound later. The first-class
mechanism (`createFileRoute`, `createServerFn`, loaders) is almost always less total work.

---

## 4. Database — Drizzle, and the migration discipline

- Schema lives in `src/db/schema.ts`. Types flow from it everywhere; don't hand-write row types.
- One-off scripts use Drizzle from a `scripts/*.ts` file, run with `bun --env-file=.env scripts/x.ts`.
  Never reach for `psql`.

**TRAP — `push` vs `migrate`, pick one per environment and commit to it:**
- `drizzle-kit push` mutates the DB directly with **no migration history**. Perfect for fast dev
  iteration on a throwaway/branch DB.
- `drizzle-kit generate` + `migrate` writes migration files and a `__drizzle_migrations` ledger.
- Mixing them is the trap: if you `push` during dev and then try to `migrate` later, the ledger
  is empty/out of sync and migrate fails — leading to hand-stamping migration hashes. **Decide at
  schema-design time:** ephemeral/branch DB → `push`; shared or production DB → `generate`+`migrate`
  from day one.

**TRAP — same DB for dev and prod (tempting in a hackathon):** causes "invalid origin" auth walls,
unique-constraint collisions between your dev clicking and prod, and scary `DROP` prompts. Use a
**branch database** (Neon) or at least a separate dev DB. It's five minutes and saves an evening.

`drizzle.config.ts` is tiny — keep it checked in. Schema-push needs an interactive TTY for
rename/alter prompts; run it in a real terminal, and when drizzle-kit offers "rename vs create"
and chokes on a combined rename+alter, choose **create** and clean up.

---

## 5. Deploy

### Vercel (default)
- One push deploys; every PR gets a preview URL. This is the path of least resistance.
- **Set every env var in the Vercel dashboard.** The #1 prod-only 500 is a missing
  `ANTHROPIC_API_KEY` / `DATABASE_URL` that exists in local `.env` but was never added to Vercel.
  When you add an env var locally, add it to Vercel in the same motion.
- **Vercel functions are serverless:** no git binary, no long-lived sockets, ~short execution
  budget, ephemeral filesystem (`/tmp` only, not persisted). Anything needing git, ssh, a real
  filesystem, or >a few seconds belongs in a background job (Inngest/Trigger.dev) or a container.
- `trustedOrigins` / CORS / cookie domains must list every domain: prod, preview, localhost.

### Deploying elsewhere (Bun server)
- TanStack Start builds a Nitro server output; you can run it under Bun on Fly/Railway/a VPS.
- Use this when you need: long-running connections (WebSockets/SSE), a real filesystem, a git
  binary, background work in-process, or no cold starts. Containers lift the serverless limits
  above — at the cost of the one-push simplicity.
- Decide Vercel-vs-container by the constraints in §0, *before* building features that need a
  container. (Building an SSH/git pipeline and only then discovering serverless can't run it is
  the exact mistake this file exists to prevent.)

---

## 6. Auth — BetterAuth notes

- DB-backed sessions; email/password + OAuth providers built in. Custom sign-in endpoints when you
  integrate something exotic (AT Protocol, SIWE, etc.).
- **Cookie config field is `defaultCookieAttributes`** (not `cookieOptions` — a wrong key is
  silently ignored, and you'll chase a "login doesn't stick" ghost for an hour).
- Cross-site / embedded widget auth needs `sameSite: 'none'`, `secure: true`, and CORS that
  **reflects the Origin** (not `*`) with `Access-Control-Allow-Credentials: true`.
- **Avoid `partitioned: true` (CHIPS)** unless you specifically want per-top-level-site cookie
  isolation — it breaks first-party session persistence. It has silently broken prod login before.
- Keep `disableCSRFCheck` to non-prod only.

---

## 7. Realtime / InstantDB (optional)

Great for live, collaborative, local-first UI. Two things to know:

- Schema/permissions are pushed via `instant-cli`; prefix with `INSTANT_APP_ID=...` if it can't
  find the app. Fields used in a `where` filter **must be indexed** — index them at schema time.
- **Bundler TRAP:** InstantDB ships internal `default0`/`default14`-style generated bindings that
  some bundlers mangle (you'll see a runtime `defaultN is not defined`). Keep Instant as a real
  dependency (don't externalize/stub it), and if the bundle still breaks, the known fix is a build
  `onSuccess`/transform that re-injects the generated `var defaultN = …`. Budget for this if you
  adopt it; it's worth it for the live-sync DX once it's working.

---

## 8. AI / LLM work

- SDK: **`@anthropic-ai/sdk`**. Default to the **latest Claude model family** (Opus for hard
  reasoning, Sonnet for the everyday workhorse, Haiku for cheap/fast) — don't hard-code an old
  model id from memory; check the current model ids in the Anthropic docs when you wire it up.
- Keep the key server-side only (a `createServerFn` or API route), never in the client bundle.
- For agent/tool-use/MCP work: read the current docs rather than reconstructing the event model
  from memory — managed-agent runtimes return tool calls as **separate stream events**, not as
  blocks inside the message content, and that distinction silently breaks naive parsers.
- Validate runtime constraints of any agent sandbox **before** designing around it (outbound
  ports, available binaries, filesystem persistence). See §0.

---

## 9. Working-with-an-AI-agent rules (hard-won)

These aren't about the stack — they're about not wasting the session:

1. **Spike the riskiest unknown in the first 15 minutes.** Can the runtime reach that host? Does
   that binary exist in prod? Probe it before building an architecture on the answer.
2. **Define done as observed behavior.** Run the real path; look at the row/render/response. If it
   can't be verified, say so out loud rather than declaring victory.
3. **Regressions: `git log -p` the suspect file first.** The cause is almost always in your own
   recent diff, not in a library's internals.
4. **3 greps, then docs.** Don't spelunk minified `node_modules` indefinitely; an unresolvable
   import IS the finding.
5. **Surface architecture/ownership questions as questions.** "Does this credential belong to the
   session or the user?" / "one agent or many?" — ask once, early, before editing around an
   assumption.
6. **Checkpoint decisions into this file (or AGENTS.md) the moment they're learned**, so a long
   session's context compaction can't quietly forget them.
7. **State the stack once, here, so it isn't repeated every message.** bun, drizzle, dev-server-is-
   running, server-fns-in-their-own-file. (That's what §0 is for.)

---

## 10. Project-specific addendum

> Everything above is portable. Put anything specific to *this* project below: domain model,
> routes, env vars, weird third-party quirks, deploy URLs. Keep §0 (hard constraints) updated as
> new landmines are found — that block is the highest-leverage part of this file.

- _(fill in per project)_

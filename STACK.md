# STACK.md

My default stack for new projects. Opinionated — one obvious choice per job. Drop into a repo and
adjust §4 per project.

## The stack

| Job | Choice |
|---|---|
| Runtime + package manager | **Bun** (`bun`, `bunx` — not npm/pnpm) |
| Framework | **TanStack Start** (Vite + React + SSR, type-safe routing) |
| Language | **TypeScript**, `strict: true` |
| Styling | **Tailwind v4** (CSS-first `@theme`, no config file) |
| Components | **shadcn/ui** (Radix) + **lucide-react** icons |
| ORM + DB | **Drizzle** + **postgres.js** → **Postgres** (Neon) |
| Auth | **BetterAuth** |
| Validation | **Zod** (input, env, API boundaries) |
| Client data | **TanStack Query** (when loaders aren't enough) |
| Forms | **TanStack Form** or **react-hook-form** + Zod |
| Email | **Resend** + **react-email** |
| Payments | **Stripe** (hosted Checkout) |
| Lint + format | **Biome** (one binary, replaces ESLint + Prettier) |
| Tests | **Vitest** (unit) + **Playwright** (e2e) |
| Env | **`@t3-oss/env-core`** + Zod (fail at boot on missing env) |
| AI | **`@anthropic-ai/sdk`**, latest Claude model family |
| Deploy | **Vercel** (zero-config), or **Bun** server if self-hosting |

Default rule for anything not listed: pick the option with the best docs and the most boring
reputation, then add it here.

## TanStack Start — the parts that matter

*(verified against current docs, Jun 2026)*

**Data loading — use loaders / `beforeLoad`, not `useEffect`.** Runs on the server, data is there
on first render, auth redirects happen before paint.

```ts
export const Route = createFileRoute('/dashboard')({
  beforeLoad: async () => {
    const session = await getSession()
    if (!session) throw redirect({ to: '/' })
  },
  loader: async () => ({ items: await getItems() }),
  component: Dashboard,
})
// inside Dashboard: const { items } = Route.useLoaderData()
```

**Server logic — `createServerFn` from `@tanstack/react-start`.** Type-safe RPC; DB/secrets/fs live
here. Shareable between loaders and client handlers.

```ts
import { createServerFn } from '@tanstack/react-start'

export const getItems = createServerFn({ method: 'GET' }).handler(async () => {
  return db.select().from(items)   // server-only — never ships to the client
})
```

**API routes (called from outside the app) — `server.handlers` on `createFileRoute`.** Not server
functions; use these for webhooks, OAuth metadata, third-party callbacks.

```ts
export const Route = createFileRoute('/api/thing')({
  server: {
    handlers: {
      GET:  async ({ request }) => Response.json({ ok: true }),
      POST: async ({ request }) => { /* ... */ },
    },
  },
})
```

## Deploy

- **Vercel**: zero-config. Nitro detects Vercel and applies the `vercel` preset automatically — no
  target setting. Every PR gets a preview URL. `vite.config.ts` plugins:
  `tanstackStart()`, `nitro()`, `viteReact()`.
- **Self-host on Bun**: Nitro produces a server build you run under Bun (Fly/Railway/VPS). Use when
  you need WebSockets/SSE, a real filesystem, or no cold starts.

## Things to pay attention to

The footguns that have actually cost time:

- **`createAPIFileRoute` does not exist.** It's in old blog posts. Use `server.handlers` (above). A
  route file using it silently never registers and requests fall through to the HTML shell.
- **Keep server-only imports out of files that render a component.** Cross the boundary via
  `createServerFn` / a server-only module — otherwise server libs leak into the client bundle
  (`Buffer is not defined`, etc.). Dynamic `import()` inside a loader does *not* fix it; moving the
  code to its own module does.
- **New/moved routes 404?** The generated route tree is stale — let the dev server regenerate it (or
  run the route-gen step) and confirm the route is in `routeTree.gen.ts`.
- **Drizzle: pick `push` or `migrate` per DB and stick to it.** `push` = fast dev, no history;
  `generate`+`migrate` = real history. Mixing them forces hand-stamping the migrations ledger later.
- **Vercel env vars:** set them in the dashboard when you add them locally. The classic prod-only
  500 is an env var that only exists in `.env`.
- **BetterAuth cookie field is `defaultCookieAttributes`** (a wrong key is silently ignored). For
  embedded/cross-site auth: `sameSite:'none'`, `secure:true`, CORS reflecting the Origin. Avoid
  `partitioned:true` unless you specifically want per-site cookie isolation.

## Project-specific

_(domain model, routes, env vars, quirks — fill in per project)_

# Vetka — knowledge base

A social layer for the personal web. People connect their websites, follow each other, and interact via **Notch** — a JS widget injected into any site.

## Product overview (user perspective)

There are two types of users:

**Regular user** — signs in, connects an existing website domain. Gets Notch injected. No agent access; shown a stub ("move your site to Tangled to unlock the agent").

**Tangled user** — signs in via AT Protocol / Tangled OAuth. Selects or creates a Tangled repo (the deployment target). The agent can build and publish their site to that repo. Gets full Notch + agent access.

Both paths converge on the same social layer:

- **Notch widget** appears on every connected site. Shows reactions, overlay (FigJam-style stickers + comments anchored to page coordinates), follow button, and login prompt for logged-out visitors.
- **SH (the hub — this app)** is the only centralized page: following list, new joiners, update feed, and discovery. Notch links back here for login and the feed.
- **Agent** is persistent per site. Tangled users can open it from the hub ("Edit") or from Notch settings. It works on the current state of the site and can also customize Notch CSS.

Login flow from a third-party site: visitor clicks login in Notch → redirect to SH → auth → return to original site, now logged in.

## Routes

```
/notch.js                   Notch widget JS (built by Bun/bunup, served as static)
/notch/test                 Dev playground — mock site with Notch injected

/                           SH hub: following list (must), new joiners (must),
                              update feed (nice), discovery
/callback                   AT Protocol OAuth callback
/u/:domain/builder          Agent for building/editing the site    [planned]
/u/:domain/*                Other per-site pages                   [planned]
/messages                   Messaging stub (icon only, no real chat) [planned]

/api/auth/*                 BetterAuth handler (email/pass, Google, session)
/api/oauth/client-metadata  AT Protocol client metadata JSON
/api/agent/session          Create / fetch managed agent session
/api/agent/message          Send message to agent
/api/agent/stream           Stream agent responses (SSE)
/api/notch/me               Returns { user: { name, email } | null } for the current session
                              — CORS + credentials, works from any third-party origin
```

Current stubs to rework: `/agent` → `/u/:domain/builder`, `/dashboard` / `/repos` / `/select-repo` → onboarding flow.

## Architecture

```
notch/src/              Notch widget source (React + inline CSS)
notch/bunup.config.ts   Builds to ../public/notch.js

src/routes/__root.tsx   Root layout
src/routes/index.tsx    Hub home (/)
src/routes/callback.tsx AT Protocol OAuth callback
src/routes/agent.tsx    Agent UI (temp — will become /u/:domain/builder)
src/routes/notch/test   Dev playground
src/routes/api/agent/   SSE + session + message API routes
src/routes/api/oauth/   AT Protocol client metadata
src/routes/api/notch/   Notch public API (me.ts — session lookup, CORS)

src/lib/auth.server.ts      BetterAuth server config
src/lib/auth-client.ts      BetterAuth browser client (useSession, signIn, signOut)
src/lib/oauth.ts            ensureOAuthConfigured() — atcute identity resolvers
src/lib/tangled.ts          listRepos / addSshKey / XRPC helpers
src/lib/agent.server.ts     Anthropic Managed Agents integration
src/lib/session-fns.ts      TanStack server functions for session access
src/db/schema.ts            Drizzle schema (source of truth)
```

## Schema

```
user              id · email · name · emailVerified · image
session           BetterAuth managed
account           BetterAuth managed (Google OAuth tokens, passwords)
verification      BetterAuth managed
tangledIdentity   did(pk) · handle · userId → user · selectedRepo{Uri,Name,Knot}
agentSession      id · userId(unique) → user · sessionId (Anthropic session)
website           id · userId → user · did → tangledIdentity · repo{Uri,Name,Knot}
                    · domain(unique) · status(draft|building|live|error) · buildLog
```

## Auth providers

| Provider | How |
|----------|-----|
| Email/password | BetterAuth built-in |
| Google | BetterAuth socialProviders.google |
| Tangled (AT Protocol) | Custom flow: atcute → `/callback` → BetterAuth session |

Tangled OAuth is a custom flow because AT Protocol auth servers are per-user/dynamic — BetterAuth's genericOAuth can't handle it. After `finalizeAuthorization()`, we look up or create a `tangledIdentity` by DID and create a BetterAuth session manually.

## Stack

- TanStack Start (Vite + React) + Tailwind v4 + TypeScript
- BetterAuth 1.6 — auth, sessions, DB-backed
- `@atcute/oauth-browser-client` — AT Protocol OAuth (browser, DPoP)
- `@atcute/identity-resolver` — handle/DID resolution (DOH + well-known + PLC)
- `@atcute/tangled` + `@atcute/atproto` — XRPC typed client + lexicons
- Anthropic Managed Agents SDK — persistent per-user agent sessions
- Drizzle ORM + postgres.js → Aiven PostgreSQL 17
- bunup — Notch widget bundler (outputs `public/notch.js`)

## Dev notes

- Run: `bun run dev`
- Notch widget: `cd notch && bun run dev` (watches + copies to `public/notch.js`)
- Schema changes: edit `src/db/schema.ts` → `bunx drizzle-kit push`
- AT Protocol `client_id` must be publicly reachable → use ngrok in dev
- Required env: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DATABASE_URL`, `ANTHROPIC_API_KEY`

## API routes

Use `createFileRoute` with a `server: { handlers: { GET/POST/... } }` block. These routes are included in the route tree and work in both dev and production — TanStack Start's own Vite dev middleware (`handleServerRoutes`) dispatches to them in dev; Nitro handles them in production.

Do **not** use `createAPIFileRoute` from `@tanstack/react-start/api` — it is not a real export in this version and routes using it are silently ignored.

The only API routes that need a separate Vite middleware plugin are those handled by external libraries with their own server (e.g. `betterAuthPlugin` for `/api/auth/*`).

## Notch cross-origin auth

The Notch widget runs on arbitrary third-party sites (`molefrog.com`, `evan.xyz`) and calls `vetka.sh/api/notch/*` with `credentials: 'include'`. For this to work:

1. **CORS:** the server must reflect the requesting `Origin` header (not `*`) and set `Access-Control-Allow-Credentials: true`. A wildcard origin blocks credentialed requests.
2. **Cookie SameSite:** in production, `auth.server.ts` sets `cookieOptions: { sameSite: 'none', secure: true }` so the BetterAuth session cookie is sent cross-site. In dev this is skipped (HTTP localhost doesn't support `Secure`).
3. **The widget** must call the API with `fetch('/api/notch/me', { credentials: 'include' })` — omitting `credentials` means no cookie is sent.

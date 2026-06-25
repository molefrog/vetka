# Vetka — knowledge base

A social layer for the personal web. People connect their websites, follow each other, and interact via **Notch** — a JS widget injected into any site.

## User types

**Regular user** — signs up with email/password, connects an existing website domain. Notch widget is installed by pasting a `<script>` tag. No agent access; can see the hub and interact socially.

**Tangled user** — signs in via AT Protocol / Tangled OAuth. Selects a Tangled git repo as their site. Gets full Notch + Anthropic Managed Agent access for AI-assisted site building.

Both converge on the same social layer: follow, feed, reactions, messages.

## User flows

### Onboarding (post-login)
`getPostLoginDestination()` decides where to send the user after login:
- Has site → `/` (hub)
- No site + Tangled identity → `/setup/tangled`
- No site + no Tangled → `/setup/script`

### Tangled setup (`/setup/tangled`)
1. `beforeLoad` guards auth; `loader` fetches `getTangledIdentity()` — redirects to `/setup/script` if no Tangled identity
2. Client-side: `listRepos()` via AT Protocol (needs browser OAuth session — can't run server-side)
3. User picks a repo → `createSite()` → redirect to `/sites/$domain/builder`

### External site setup (`/setup/script`)
1. `beforeLoad` guards auth
2. User enters domain → sees `<script>` tag to paste
3. Polls `/api/notch/check?domain=` every 5s → on detection, `createSite()` → redirect to `/`

### Builder (`/sites/$domain/builder`)
Split view: iframe (site preview) + chat (Anthropic Managed Agent). Auth guard in `beforeLoad`; agent session fetched client-side via `/api/agent/session`.

## Routes

```
/                           Hub: feed, notifications, new members, login modal
/callback                   AT Protocol OAuth callback (resolves DID → handle via plc.directory)
/setup/tangled              Pick Tangled repo (Tangled users only)
/setup/script               Paste script tag (regular users)
/sites                      User's sites list (one site max for now)
/sites/$domain/builder      Agent + site preview

/api/auth/*                 BetterAuth (email/pass, session)
/api/oauth/client-metadata  AT Protocol client metadata
/api/agent/session          Get or create Anthropic Managed Agent session
/api/agent/stream           SSE stream for agent responses
/api/notch/me               CORS + credentials — returns current user for Notch widget
/api/notch/check            Server-side check if notch.js is on a domain
```

## Data model

```
user              BetterAuth core
session           BetterAuth core
account           BetterAuth core (passwords, OAuth tokens)
verification      BetterAuth core
tangledIdentity   did(pk) · handle · userId → user · selectedRepo{Uri,Name,Knot}
agentSession      userId(unique) → user · sessionId (Anthropic session ID)
                    · sshPrivateKey · sshPublicKey · sshKeyFileId
site              id · domain(unique) · userId → user · isTangled · did → tangledIdentity
                    · repo{Uri,Name,Knot} · status(draft|building|live|error) · buildLog
follow            followerId → site · followeeId → site  (unique pair)
message           fromId → site · toId → site · body · readAt
reaction          pageUrl(indexed) · siteId → site · authorUserId → user
                    · emoji · x · y (0–100% position) · body (optional comment)
```

## TanStack Start patterns

Use **loaders and `beforeLoad`** — not `useEffect` — for auth guards and server-fetched data.

```typescript
export const Route = createFileRoute('/some/route')({
  // Auth guard — runs on server, throws redirect before render
  beforeLoad: async () => {
    const session = await getAuthSession()
    if (!session?.user) throw redirect({ to: '/' })
  },
  // Data fetching — runs on server, available immediately
  loader: async () => {
    const sites = await getUserSites()
    return { sites }
  },
  component: MyPage,
})

function MyPage() {
  const { sites } = Route.useLoaderData()  // no loading state needed
  // ...
}
```

**Exceptions — keep client-side:**
- `listRepos()` — reads AT Protocol OAuth session from browser localStorage
- Agent session fetch — creates session on demand, not safe to deduplicate in loader

**API routes** use `server.handlers` inside `createFileRoute`:
```typescript
export const Route = createFileRoute('/api/something')({
  server: {
    handlers: {
      GET: async ({ request }) => Response.json({ ok: true }),
      POST: async ({ request }) => { ... },
    },
  },
})
```
Do NOT use `createAPIFileRoute` from `@tanstack/react-start/api` — it doesn't exist in this version.

**Server functions** (`createServerFn`) are the right abstraction for shared server logic called from both loaders and client event handlers:
```typescript
export const getUserSites = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getAuthSession()
  if (!session?.user) return []
  return db.select().from(schema.site).where(eq(schema.site.userId, session.user.id))
})
```

## Auth

| Provider | Flow |
|---|---|
| Email/password | BetterAuth built-in |
| Tangled (AT Protocol) | `@atcute/oauth-browser-client` → `/callback` resolves DID via `plc.directory` → custom `/api/auth/sign-in/tangled` endpoint creates BetterAuth session |

`trustedOrigins` in `auth.server.ts` must include all domains (vetka.sh, tailscale URL, localhost).  
`disableCSRFCheck: true` is set for non-production to allow cross-origin dev logins.

## Notch cross-origin auth

The widget runs on third-party sites and calls `vetka.sh/api/notch/*` with `credentials: 'include'`. Requires:
1. CORS: reflect `Origin` header (not `*`), `Access-Control-Allow-Credentials: true`
2. Cookie: `sameSite: 'none', secure: true` in production (`auth.server.ts`)

## Stack

- TanStack Start (Vite + React + SSR) + Tailwind v4 + TypeScript
- BetterAuth 1.6 — sessions, DB-backed
- `@atcute/oauth-browser-client` — AT Protocol OAuth (DPoP, browser-only)
- `@atcute/identity-resolver` — handle/DID resolution
- `@atcute/tangled` + `@atcute/atproto` — XRPC typed client + lexicons
- Anthropic Managed Agents SDK — persistent per-user agent sessions
- Drizzle ORM + postgres.js → Aiven PostgreSQL 17
- bunup — Notch widget bundler (`notch/` → `public/notch.js`)

## Dev

- App: `bun run dev` (access via tailscale URL for Tangled OAuth)
- Notch widget: `bun run dev:notch` — **must run in a separate terminal**; watches `notch/src/` and rebuilds `public/notch.js` on every change. Without this, the widget served at `/notch.js` is a stale build.
- Schema changes: edit `src/db/schema.ts` → `bunx drizzle-kit push` (needs interactive TTY — run in terminal with `!`)
- Nitro is excluded from dev (`vite.config.ts`) to avoid breaking TanStack's dev middleware
- Same Aiven PostgreSQL instance used for dev and prod (hackathon)

## Design references

- `design/reactions/` — reaction-sticker pack + treatment spec (the 8 Vetka Signals, `REACTIONS.md`,
  browser preview). The reactions **overlay UI is specced but unbuilt**: backend is ready (`reaction`
  table + `/api/notch/reactions`), but the `reactions` button in `notch/src/Widget.tsx` is an inert
  stub (no onClick, no overlay/picker/stamp rendering). See `design/reactions/README.md`.
- Other design handoffs live in the gitignored `local-drafts/` — not on GitHub.

## Anthropic Managed Agents

Docs: https://platform.claude.com/docs/en/managed-agents/overview

We use a **single global agent** (not per-user) with **per-user sessions**. The agent holds the system prompt and tool config; the session is the live sandbox + conversation history for one user.

Constants in `src/lib/agent.server.ts`:
- `AGENT_ID = 'agent_019VzGQn8ggkHmQxrDrHcJjU'` — managed in the Anthropic console, currently version 5+
- `ENV_ID = 'env_016Mr6pEcERwBFoo1Jmzv8Yu'` — the cloud sandbox environment (Linux container)

To update the system prompt, edit and re-run `scripts/update-agent.mjs` — it retrieves the current agent version (required for optimistic locking) then calls `client.beta.agents.update()`.

### Per-user session flow

1. `GET /api/agent/session` — calls `getOrCreateSession(userId)`, which looks up `agentSession` table or calls `client.beta.sessions.create({ agent: AGENT_ID, environment_id: ENV_ID })` and persists the new `sessionId`. Then loads history by calling `client.beta.sessions.events.list(sessionId)`, sorting events by `processed_at`, and reconstructing `ChatMessage[]`.
2. `POST /api/agent/stream` — prepends a `<vetka_context>` block (repo URL, prod URL, git instructions) to the user message, sends it via `client.beta.sessions.events.send()`, then streams back SSE events until `session.status_idle`.

### Event model (critical)

Tool events are **separate stream events**, not embedded in `agent.message.content` (which only carries `TextBlock[]`):

| SDK event | What it is |
|---|---|
| `agent.thinking` | Agent is reasoning |
| `agent.message` | Text response blocks |
| `agent.tool_use` | Built-in tool call |
| `agent.mcp_tool_use` | MCP tool call (has `mcp_server_name`) |
| `agent.custom_tool_use` | Custom tool call |
| `agent.tool_result` | Result for `agent.tool_use` |
| `agent.mcp_tool_result` | Result for `agent.mcp_tool_use` (key: `mcp_tool_use_id`) |
| `session.status_idle` | Agent finished — stop streaming |

### Context injection

Each user message gets a `<vetka_context>` XML prefix with the user's repo URL and prod URL. When reconstructing history in `session.ts`, this prefix is stripped via regex before returning messages to the client.

### MCP servers

MCP servers must be **public HTTPS URLs** — the Anthropic platform calls them, not the agent sandbox. Configure via `mcp_servers: [{ type: 'url', name, url }]` in agent or session config.

### Environments and pre-installed packages

Environments support `packages.pip` / `packages.npm` / `packages.apt` to pre-install dependencies before the agent starts (cached across sessions). To add packages, create or update an environment via `client.beta.environments.create/update`. The current `ENV_ID` is the default cloud environment.

## One-off DB scripts

Use Drizzle directly from a `scripts/*.ts` file and run with `bun --env-file=.env scripts/your-script.ts`:

```typescript
import { db } from '../src/db'
import { agentSession } from '../src/db/schema'
import { eq } from 'drizzle-orm'

const deleted = await db.delete(agentSession).where(eq(agentSession.userId, 'abc')).returning()
console.log(deleted)
process.exit(0)
```

See `scripts/clear-session.ts` for a working example.

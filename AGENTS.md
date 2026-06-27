# Vetka — knowledge base

A social layer for the personal web. People connect their websites, follow each other, and interact via **Notch** — a JS widget injected into any site.

## User types

Everyone signs in the same way — passwordless **email OTP**, **Google**, or **GitHub** — and gets one site. There are two kinds of site:

**External site** — the user connects a website they already own by pasting the Notch `<script>` tag. `site.kind = 'external'`, `domain` is their own domain. Social-only; no agent.

**Generated site** — the user picks a free `name.web.sh` address and the Anthropic Managed Agent builds a static React/Tailwind site that Vetka hosts (served from object storage). `site.kind = 'generated'`, `subdomain` is the label, `domain` is `<subdomain>.web.sh`.

Both converge on the same social layer: follow, feed, reactions, messages.

## User flows

### Onboarding (post-login)
`getPostLoginDestination()` sends the user to `/` if they already have a site, otherwise to `/setup`.

### Setup choice (`/setup`)
Two options: "Connect an existing website" → `/setup/script`, or "Generate a new site" → `/setup/generate`.

### Generate setup (`/setup/generate`)
1. `beforeLoad` guards auth
2. User picks a subdomain label → `checkSubdomain()` validates availability → `createSite({ kind: 'generated', subdomain })`
3. Redirect to `/sites/$domain/builder` where the agent builds it

### External site setup (`/setup/script`)
1. `beforeLoad` guards auth
2. User enters domain → sees `<script>` tag to paste
3. Polls `/api/notch/check?domain=` every 5s → on detection, `createSite({ kind: 'external' })` → redirect to `/`

### Builder (`/sites/$domain/builder`)
Split view: iframe (live site preview) + chat (Anthropic Managed Agent). A "Versions" tab lists deploy snapshots and can roll back. Auth guard in `beforeLoad`; agent session fetched client-side via `/api/agent/session`.

## Routes

```
/                           Hub: feed, notifications, new members, login modal
/setup                      Onboarding choice (connect existing vs generate)
/setup/script               Paste script tag (external site)
/setup/generate             Pick a *.web.sh subdomain (generated site)
/sites                      User's sites list (one site max for now)
/sites/$domain/builder      Agent + live preview + versions

/api/auth/*                 BetterAuth (email OTP + Google + GitHub, session)
/api/agent/session          Get or create Anthropic Managed Agent session
/api/agent/stream           SSE stream for agent responses
/api/agent/deploy           Deploy relay — agent POSTs built files (Bearer = short-lived deploy token)
/api/serve/$                Static serving for *.web.sh (resolves Host → site → storage)
/api/sites/$domain/snapshots  List deploy snapshots / POST to roll back
/api/notch/me               CORS + credentials — returns current user for Notch widget
/api/notch/check            Server-side check if notch.js is on a domain
```

## Data model

```
user              BetterAuth core
session           BetterAuth core
account           BetterAuth core (OAuth tokens; no passwords — OTP/Google only)
verification      BetterAuth core (also holds email OTP codes)
agentSession      userId(unique) → user · sessionId (Anthropic session ID)
deployToken       siteId → site · tokenHash(unique) · expiresAt  (short-lived deploy creds)
site              id · domain(unique) · userId → user · kind(external|generated)
                    · subdomain(unique, generated only) · status(draft|building|live|error)
                    · buildLog · liveSnapshotId → siteSnapshot (current live version)
siteSnapshot      id · siteId → site · storagePrefix · fileCount · byteSize · message
                    · status(pending|building|success|failed) · triggeredBy(agent|manual)
siteImage         siteId → site · WebP blob (page thumbnail; capture still a stub)
follow            followerId → site · followeeId → site  (unique pair)
message           fromId → site · toId → site · body · readAt
reaction          pageUrl(indexed) · siteId → site · authorUserId → user
                    · emoji · x · y (0–100% position) · body (optional comment)
```

Schema is applied with `bunx drizzle-kit push` (interactive). For the Tangled→generated-sites
migration, `scripts/migrate-remove-tangled.sql` has the equivalent raw SQL.

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

Passwordless only.

| Provider | Flow |
|---|---|
| Email OTP | BetterAuth `emailOTP` plugin. `authClient.emailOtp.sendVerificationOtp({ email, type: 'sign-in' })` emails a 6-digit code (via `sendOtpEmail` in `email.server.ts` — Resend if `RESEND_API_KEY` is set, else console-logged in dev), then `signIn.emailOtp({ email, otp })`. First-time emails auto-create the user. |
| Google | BetterAuth social provider, enabled when `GOOGLE_CLIENT_ID` is set. `signIn.social({ provider: 'google' })`. |
| GitHub | BetterAuth social provider, enabled when `GITHUB_CLIENT_ID` is set. `signIn.social({ provider: 'github' })`. |

`trustedOrigins` in `auth.server.ts` must include all domains (vetka.sh, tailscale URL, localhost).  
`disableCSRFCheck: true` is set for non-production to allow cross-origin dev logins.

## Hosting generated sites

Generated sites are static files in object storage, served from the wildcard subdomain.

- **Storage** (`src/lib/storage.server.ts`): a `Storage` interface with two drivers — `local`
  (filesystem under `STORAGE_LOCAL_DIR`, dev default) and `s3` (any S3-compatible bucket; defaults
  target Cloudflare R2 via `R2_ENDPOINT`/`R2_BUCKET`, also works with AWS S3). Selected by
  `STORAGE_DRIVER` or the presence of bucket creds. Layout: `sites/<id>/live/` (served) and
  `sites/<id>/snapshots/<snapshotId>/` (immutable versions).
- **Deploy** (`src/lib/deploy.server.ts` + `/api/agent/deploy`): the agent bundles with bun, calls
  the `get_deploy_credentials` custom tool to get a short-lived per-site **deploy token**
  (`src/lib/deploy-token.server.ts`, default 2h, stored hashed in `deploy_token`), then POSTs the
  built files (JSON `{ files: [{ path, contentBase64 }] }`, `Bearer <deploy token>`). The token
  determines the target site (the agent can't deploy elsewhere). Each deploy writes a snapshot,
  republishes it to `live/`, and points `site.liveSnapshotId` at it. `rollbackSite()` re-publishes
  an older snapshot. On an expired token the relay returns 401 `code: "token_expired"` and the
  agent refreshes via the tool.
- **Serving** (`/api/serve/$`): resolves the request `Host` (`<sub>.web.sh`) → `site.subdomain` →
  storage `live/` prefix and streams the file (SPA fallback to `index.html`). The reverse proxy
  fronting `*.web.sh` forwards here preserving `Host` (may also pass `X-Vetka-Subdomain`).

## Notch cross-origin auth

The widget runs on third-party sites and calls `vetka.sh/api/notch/*` with `credentials: 'include'`. Requires:
1. CORS: reflect `Origin` header (not `*`), `Access-Control-Allow-Credentials: true`
2. Cookie: `sameSite: 'none', secure: true` in production (`auth.server.ts`)

## Stack

- TanStack Start (Vite + React + SSR) + Tailwind v4 + TypeScript
- BetterAuth 1.6 — sessions, DB-backed (email OTP + Google + GitHub)
- Anthropic Managed Agents SDK — persistent per-user agent sessions (build generated sites)
- `@aws-sdk/client-s3` — S3-compatible object storage (Cloudflare R2 / AWS S3) for hosted sites
- Drizzle ORM + postgres.js → Aiven PostgreSQL 17
- bunup — Notch widget bundler (`notch/` → `public/notch.js`)

## Dev

- App: `bun run dev`
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

Constants in `src/lib/agent.server.ts` (overridable via `ANTHROPIC_AGENT_ID` / `ANTHROPIC_ENV_ID`):
- `AGENT_ID = 'agent_019VzGQn8ggkHmQxrDrHcJjU'` — managed in the Anthropic console
- `ENV_ID = 'env_01AKeJed2CAzKMdAMmQ3zTnN'` — the cloud sandbox environment (Linux container)

To update the system prompt/tools, edit and re-run `scripts/update-agent.mjs` — it retrieves the current agent version (required for optimistic locking) then calls `client.beta.agents.update()`.

### Per-user session flow

1. `GET /api/agent/session` — calls `getOrCreateSession(userId)`, which looks up `agentSession` table or calls `client.beta.sessions.create({ agent: AGENT_ID, environment_id: ENV_ID })` and persists the new `sessionId` (no SSH keys — deploys are storage-based). Then loads history via `client.beta.sessions.events.list(sessionId)`, sorts by `processed_at`, and reconstructs `ChatMessage[]`.
2. `POST /api/agent/stream` — prepends a `<vetka_context>` block (site id, prod URL, deploy curl template) to the user message, sends it via `client.beta.sessions.events.send()`, then streams back SSE events until `session.status_idle`. The agent calls the `get_deploy_credentials` custom tool, which the stream handler services by minting a short-lived deploy token (real token to the agent, redacted in the client stream); the agent then curls `/api/agent/deploy` with it.

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

Each user message gets a `<vetka_context>` XML prefix with the generated site's prod URL and deploy-relay instructions. When reconstructing history in `session.ts`, this prefix is stripped via regex before returning messages to the client.

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

# Vetka — knowledge base

SSH key manager for [Tangled](https://tangled.org) repos, built on AT Protocol OAuth.

## What it does

1. User signs in (email/password, Google, or Tangled OAuth)
2. App lists their Tangled repos (`sh.tangled.repo` records from their AT Protocol PDS)
3. User pastes an SSH public key → app creates a `sh.tangled.publicKey` record in their PDS
4. Tangled knot servers read those records to grant SSH access

## Architecture

```
app/page.tsx            login
app/callback/page.tsx   AT Protocol OAuth callback → stores session → /repos
app/repos/page.tsx      repo list + SSH key management (client-side, atcute)

app/api/auth/[...all]/  BetterAuth handler (email/pass, Google, session mgmt)
app/api/oauth/client-metadata/  AT Protocol client metadata JSON

lib/auth.ts             BetterAuth server config
lib/auth-client.ts      BetterAuth browser client (useSession, signIn, signOut)
lib/oauth.ts            ensureOAuthConfigured() — atcute identity resolvers
lib/tangled.ts          listRepos / listSshKeys / addSshKey via XRPC
lib/db/schema.ts        Drizzle schema (source of truth)
lib/db/index.ts         postgres.js + Drizzle instance
```

## Schema

```
user         id(text) · email · name · emailVerified · atpDid · atpHandle
session      BetterAuth managed
account      BetterAuth managed (Google OAuth tokens, passwords)
verification BetterAuth managed (email verification)
website      id(uuid) · userId → user · domain(unique)
```

`atpDid` / `atpHandle` on `user` are set when signing in via Tangled OAuth.
Tangled OAuth is a custom flow (AT Protocol's auth server is per-user/dynamic, so
BetterAuth's genericOAuth can't handle it). After `finalizeAuthorization()`, we
look up or create a user by DID and create a BetterAuth session manually.

## Auth providers

| Provider | How |
|----------|-----|
| Email/password | BetterAuth built-in |
| Google | BetterAuth socialProviders.google |
| Tangled (AT Protocol) | Custom flow: atcute → `/api/auth/atp` → BetterAuth session |

## Stack

- Next.js 16 + Tailwind v4 + TypeScript
- BetterAuth 1.6 — auth, sessions, DB-backed
- `@atcute/oauth-browser-client` — AT Protocol OAuth (browser, DPoP)
- `@atcute/identity-resolver` — handle/DID resolution (DOH + well-known + PLC)
- `@atcute/tangled` + `@atcute/atproto` — XRPC typed client + lexicons
- Drizzle ORM + postgres.js → Aiven PostgreSQL 17

## Dev notes

- Run: `bun run dev` (uses `node node_modules/next/dist/bin/next` directly — `.bin/next` broken on Node v24)
- Schema changes: edit `lib/db/schema.ts` → `bunx drizzle-kit push`
- Drizzle config reads `.env.local` via dotenv
- Tailwind config in `app/globals.css` via `@theme inline` — no `tailwind.config.js`
- Import `@atcute/atproto` and `@atcute/tangled` at module top to register ambient XRPC types
- Google + `BETTER_AUTH_SECRET` + `BETTER_AUTH_URL` needed in `.env.local`
- AT Protocol `client_id` must be publicly reachable → ngrok in dev

# Vetka — Codebase Review & Path to Full Functionality

_Reviewed 2026-07-02. Scope: full repository (server, client, widget, data model, infra, tooling)._

Vetka is a hackathon-stage "social layer for the personal web": TanStack Start
(Vite + React SSR), BetterAuth, Drizzle/Postgres (Aiven), Anthropic Managed
Agents that build generated static sites served from object storage, and a
"Notch" widget embedded on registered sites.

The single biggest structural problem is **divergence between the docs
(`AGENTS.md`), the schema, and running behavior** — most visibly around
reactions: the docs describe the reactions overlay as an unbuilt stub backed by
a ready Postgres `reaction` table + `/api/notch/reactions`. Reality is the
inverse — the overlay is fully built and persists to **InstantDB** (undocumented),
while the Postgres table and route **do not exist**. On top of that sit several
real security bugs and a total absence of tests and migrations.

A first pass of critical security fixes has been applied on this branch (see
[§ Fixes applied](#fixes-applied-this-branch)). Everything else below remains
open work, prioritized.

---

## Feature completeness (what actually works vs. the docs)

| Feature | Status | Notes |
|---|---|---|
| Follow / unfollow | ✅ Working | `/api/notch/follows`, widget toggle, optimistic revert |
| Feed (hub) | ⚠️ Partial | Works but loaded in `useEffect` not a loader; no error state; stale `.vercel.app` name transform |
| Feed (widget) | ⚠️ Partial | Global only — `notch/src/FeedPanel.tsx:23` sends no `?scope=` and no `credentials`, so the friends scope is unreachable |
| Reactions | ⚠️ Built, undocumented | Overlay/picker/placement/live stamps all built on **InstantDB**; not joined to Postgres/feed/notifications; anchoring uses raw document % |
| Messages (DMs) | ✅ Working | `/api/notch/conversations*`, optimistic send |
| Notifications | ❌ Faked | Hub renders a hardcoded `NOTIFICATIONS` array (`src/routes/index.tsx:21-25`); the real `/api/notch/notifications` endpoint is never called by any client |
| Builder chat | ✅ Working | Agent session + SSE stream + tool cards + attachments |
| Versions / rollback | ✅ Working | `VersionsPanel`, `/api/sites/$domain/snapshots` |
| Auth (email OTP) | ✅ Working | Incl. onboarding redirect |
| Auth (Google/GitHub) | ⚠️ Partial | Works but social `callbackURL` is the hub, bypassing `getPostLoginDestination` — new social users never reach `/setup` |
| Screenshots / thumbnails | ❌ Dead | `siteSnapshot.imageId` never populated; the whole `siteImage` pipeline is unbuilt, so feed previews 404 |

---

## Findings by severity

### Critical

1. **Site takeover via `createSite`** — `src/lib/session-fns.ts`. Upserted on
   `site.domain` and overwrote `userId` on conflict; any authed user could
   reassign another user's site (and its follows/messages/snapshots). No
   one-site-per-user constraint; no server-side reserved/format validation.
   **✅ Fixed** (ownership + one-site + subdomain validation).
2. **Agent session IDOR** — `src/routes/api/agent/stream.ts`. `sessionId` was
   taken from the request body and never validated against the user → inject
   into / stream another user's agent session, mount files into their sandbox.
   **✅ Fixed** (session resolved server-side via `getOrCreateSession`).
3. **CSRF + exfiltration on Notch endpoints** — CORS reflected any Origin with
   credentials; cookies are `SameSite=None`; follow/DM POSTs are CORS "simple"
   requests (no preflight). Any page a logged-in user visited could act as them
   and read DMs/followers/notifications; `/api/notch/me` returned the user's
   **email** to any origin. **✅ Fixed** (origin allowlist restricted to
   registered site domains + email removed).
4. **InstantDB world-open perms + PII leak** — `src/instant.perms.ts` allows
   unauthenticated `create`/`view` for reactions; `notch/src/Widget.tsx`
   persisted `authorSeed: user.email` into world-readable rows. **✅ Email leak
   fixed** (non-PII seed). Residual: write abuse still possible until writes are
   bound to an authenticated identity — documented in `instant.perms.ts`.
5. **Zero automated tests.** vitest is fully configured but there are no
   test/spec files. `src/routes/notch/test.tsx` is a dev harness; `_tool_test.mjs`
   is a manual live-API script. All security-critical paths (deploy token,
   storage, subdomain resolution, `createSite`) are untested. **Open.**
6. **No migration pipeline + shared dev/prod DB.** Schema is applied with
   `drizzle-kit push` from a laptop against the single Aiven instance used for
   both dev and prod; `drizzle/*.sql` are decorative. No review or rollback.
   **Open.**

### High

- **Builder read IDOR** — `getBuilderSiteData` + `builder.tsx` checked only auth,
  not ownership → any user could open `/sites/<other-domain>/builder`.
  **✅ Fixed** (ownership check + redirect on null).
- **Dual lockfiles + mixed package managers** — `bun.lock` and
  `package-lock.json` both committed, plus a `pnpm` block in `package.json`.
  They will drift; Vercel may resolve a different tree than local. **Open** —
  pick one (bun) and delete the others.
- **`"latest"` version pins** on all core TanStack deps (`package.json:22-26,46`)
  → non-reproducible builds. **Open** — pin to concrete versions.
- **`SUBDOMAIN_ROOT` defaults to `web.sh`** (`session-fns.ts`, `serve/$.ts`,
  `server/middleware/subdomain.ts`) while hosting/DNS/`vercel.json` target
  `vetka.sh`. If `VITE_SUBDOMAIN_ROOT` is unset, generated sites get
  unresolvable domains. **Open** — default to `vetka.sh`, purge `web.sh` strings.
- **Docs reference a missing file** — `AGENTS.md` cites
  `scripts/migrate-remove-tangled.sql`, which doesn't exist (the SQL lives at
  `drizzle/0001_pr_schema_changes.sql`). **Open.**

### Medium

- **SSRF in `/api/notch/check`** — unauthenticated fetch of `https://${domain}`
  with no host/private-IP filtering, no rate limit, unbounded `res.text()`.
  Add an allowlist/deny private ranges, cap the body, throttle.
- **Path traversal on local storage read** — `sanitizeRelPath` is applied only
  on write; the local driver's `join(baseDir, key)` resolves `..`
  (`storage.server.ts`, `serve/$.ts`). Dev/self-hosted only (S3 keys are
  literal). Sanitize on read too.
- **Untrusted `X-Vetka-Subdomain`/`_sub` override** — `serve/$.ts` lets any
  caller pick which site to serve on the main host.
- **Unbounded deploy payloads** — `/api/agent/deploy` has no file-count/byte cap
  and decodes all base64 into memory.
- **Deploy publish race** — `deletePrefix(live)` then `copyPrefix` is
  non-atomic (`deploy.server.ts`); concurrent deploys interleave and there's a
  404 window. Publish to a new prefix and swap the pointer atomically.
- **SSE ignores client disconnect** — `stream.ts` never checks `request.signal`;
  a departed browser keeps the upstream Anthropic stream running.
- **Client bugs** — polling `setInterval` never cleared in `setup/script.tsx`
  (leak + setState-after-unmount); SSE parser in `builder.tsx` splits on `\n`
  per chunk with no cross-chunk buffer (drops tokens on boundary); `onClose()`
  called during render in `LoginModal`; builder preview doesn't refresh after a
  chat-triggered deploy; OAuth users skip onboarding.
- **Missing indexes** — `message.to_id`, `follow.followee_id`, `site.user_id`
  are all hot-path lookups with no index.
- **`siteImage` WebP blobs as `bytea`** in the shared Postgres (no cap) — belongs
  in object storage.
- **Free-text `kind`/`status` columns** — no `pgEnum`/CHECK; `site.liveSnapshotId`
  is a plain uuid, not a real FK.
- **`vercel.json` vs docs mismatch** — the actual mechanism is a `_sub` query
  param off `x-forwarded-host`, not the `Host`/`X-Vetka-Subdomain` scheme
  `AGENTS.md` describes; the rewrite also catches all paths.
- **Error-detail leakage** — raw `err.message`/`String(err)` returned in deploy
  results and SSE error events.
- **No rate limiting** anywhere (OTP send/verify, notch/check, DMs, follows).

### Low

- No 404 / error boundary (`router.tsx`, `__root.tsx`).
- Stale `.vercel.app` name transforms; hardcoded `web.sh` UI strings; fake
  notification data in the hub.
- Duplicate `scripts/clear-session.{ts,mjs}` with a hardcoded personal email;
  the `.mjs` uses `pg`, which isn't a declared dependency.
- Leftover `_tool_test.mjs`, committed `.claude/scheduled_tasks.lock`, hardcoded
  Tailscale host in `vite.config.ts:66`.
- `AGENTS.md` routes table omits many implemented endpoints (`/api/feed`,
  `/api/agent/upload`, `/api/notch/{site,follows,followers,conversations*,
  notifications}`, `/api/dev/domains`, snapshot).
- Deploy tokens never garbage-collected; agent history hard-truncated at 300
  events silently; `getViewer` picks "first site" with `.limit(1)` and no
  `orderBy`.

---

## Path to full functionality

1. **Reconcile the data story.** Decide on one reactions store. If InstantDB
   stays: document it in `AGENTS.md`, bind writes to a Vetka session (server
   relay or InstantDB auth), and drop the remaining anonymous-write risk. If
   Postgres: build the `reaction` table + `/api/notch/reactions` and migrate the
   widget. Either way, update `AGENTS.md` to match reality (reactions, the
   `web.sh`→`vetka.sh` naming, the full route list, the `vercel.json` mechanism).
2. **Finish closing the security gaps.** Remaining after this branch: SSRF
   hardening on `/api/notch/check`, storage read-path sanitization, deploy
   payload caps + atomic publish, SSE disconnect handling, and rate limiting.
3. **Wire the missing UI.** Real notifications (call `/api/notch/notifications`,
   drop the hardcoded array), widget feed friends scope + credentials, post-deploy
   preview/versions refresh, and the OAuth onboarding redirect.
4. **Build the foundations.** One package manager + pinned deps; real Drizzle
   migrations with a separate dev/prod database; a `vitest.config` plus first
   tests on the security-critical helpers (`createSite`, deploy-token
   mint/verify, subdomain resolution, the Notch origin allowlist); add the
   missing indexes, enums, and FKs; add 404/error boundaries.

---

## Fixes applied (this branch)

Scoped to the tractable critical security items:

| # | Fix | Files |
|---|---|---|
| 1 | `createSite`: reject cross-user domains, enforce one site per user, validate generated subdomains server-side; ownership can no longer change through the upsert | `src/lib/session-fns.ts` |
| 2 | Agent session resolved server-side from the authenticated user; body `sessionId` no longer trusted | `src/routes/api/agent/stream.ts` |
| 3 | Notch CORS restricted to registered site origins; state-changing POST/DELETE reject non-registered cross-site origins (CSRF); email removed from `/api/notch/me` and `getViewer` | `src/lib/notch-social.ts`, `src/routes/api/notch/me.ts`, `src/routes/api/notch/follows.ts`, `src/routes/api/notch/conversations/$peerId/messages.ts` |
| 4 | Widget no longer persists user email into world-readable reactions (non-PII seed); residual write-abuse risk documented | `notch/src/Widget.tsx`, `src/instant.perms.ts` |
| 5 | Builder site data gated on ownership; non-owners redirected | `src/lib/builder-fns.ts`, `src/routes/sites/$domain/builder.tsx` |

> On finding #3, the original plan proposed a CSRF token echoed in a custom
> header. That approach is defeated here because the same open CORS that enables
> the attack also lets an attacker read the token, so it was replaced with a
> server-side **Origin allowlist** keyed on registered site domains — the only
> legitimate cross-origin callers. It needs no widget-side changes (the browser
> always sends `Origin`).

Deliberately **not** attempted in this pass (documented above, left as roadmap):
tests, migrations/DB split, dependency & lockfile cleanup, indexes/enums, the
client bugs, and the remaining medium/low server hardening.

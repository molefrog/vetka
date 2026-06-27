# Vetka — production environment setup (handoff memo)

**Audience:** the agent/engineer provisioning infrastructure (Cloudflare + Vercel + Postgres + Anthropic).
**Goal:** stand up the new architecture from PR #3 so users can log in, generate a site with the AI agent, and have it deploy + serve at `https://<name>.web.sh`.

This memo is the runbook. It assumes the code on branch `claude/remove-tango-website-builder-srchld` and does **not** assume any prior Vetka infra beyond the existing Postgres + Vercel project. Env-var names below are the exact ones the code reads — see `.env.example` and `src/lib/*.server.ts`.

---

## 0. Architecture in one picture

```
Browser ──► vetka.sh (TanStack Start app on Vercel)
                │  auth (email OTP + Google + GitHub), builder UI
                ▼
        Anthropic Managed Agent session  ── builds static site with bun
                │  calls get_deploy_credentials (custom tool) → short-lived token
                ▼
        curl POST vetka.sh/api/agent/deploy  (Bearer <deploy token>)
                │  writes immutable snapshot + publishes to live/
                ▼
        Object storage (Cloudflare R2, private bucket)
                ▲
visitor ──► <name>.web.sh  ──►  /api/serve/$  reads sites/<id>/live/ from R2
```

Two domains, both pointing at the same app: **`vetka.sh`** (the product) and **`*.web.sh`** (hosted user sites, served by `/api/serve/$`).

---

## 1. Postgres (database)

Already exists (Aiven). You only need to **apply the schema** for this branch.

- Migrations live in `drizzle/`: `0000_baseline` → `0001_pr_schema_changes` → `0002_deploy_tokens`.
- Apply with **either**:
  - `bunx drizzle-kit push` (interactive — confirm the drops/renames), **or**
  - `psql "$DATABASE_URL" -f drizzle/0001_pr_schema_changes.sql && psql "$DATABASE_URL" -f drizzle/0002_deploy_tokens.sql`
- ⚠️ **Destructive:** `0001` drops the `tangled_identity` table and Tangled columns. Confirm no other consumer depends on them. AGENTS.md notes dev and prod share one instance — coordinate timing.
- Verify afterward: tables `site` (has `kind`, `subdomain`, `live_snapshot_id`), `site_snapshot` (has `storage_prefix`, `file_count`, `byte_size`, `message`), and `deploy_token` exist.

Set `DATABASE_URL` in the app env (already set if reusing the instance).

---

## 2. App hosting (Vercel)

Existing project, framework `null`, build `bun run build` (see `vercel.json`).

1. Set all env vars from §6 in the Vercel project (Production + Preview as appropriate).
2. Add domains to the project: `vetka.sh`, `www.vetka.sh`, **and** `web.sh` + `*.web.sh` (wildcard). Vercel issues the wildcard TLS cert once DNS is verified (§4).
3. Add the host-based rewrite so `*.web.sh` requests hit the serving route **with the Host header preserved**. Update `vercel.json`:

```jsonc
{
  "buildCommand": "bun run build",
  "framework": null,
  "rewrites": [
    {
      "source": "/(.*)",
      "has": [{ "type": "host", "value": "(?<sub>[^.]+)\\.web\\.sh" }],
      "destination": "/api/serve/$1"
    }
  ]
}
```

`/api/serve/$` (`src/routes/api/serve/$.ts`) resolves the subdomain from the `Host` header (falls back to `X-Vetka-Subdomain`), looks up the `site`, and streams from R2 `sites/<id>/live/`. SPA fallback to `index.html` is built in.

> Note: this serves every static asset through a serverless function. Fine to launch on. For scale, see §4's "Option B" (Cloudflare Worker direct from R2).

---

## 3. Object storage (Cloudflare R2)

The app writes deployed sites here and serves them back. Code: `src/lib/storage.server.ts` (S3-compatible driver), `src/lib/deploy.server.ts`.

1. Create a bucket, e.g. `vetka-sites`. **Keep it private. Do NOT enable the public `r2.dev` URL or public bucket access, and do not enable listing.** (Snapshots of every version live in the same bucket — see layout below.)
2. Create a scoped **R2 API token** (S3 credentials: Access Key ID + Secret) limited to this one bucket with object read/write/delete + list. Note the account's S3 endpoint: `https://<accountid>.r2.cloudflarestorage.com`.
3. Set env (selects the `s3` driver automatically when endpoint + bucket are present):
   - `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
   - (or force with `STORAGE_DRIVER=s3`)

**Key layout** (managed by code, do not pre-create):
```
sites/<siteId>/live/...              ← currently served (public content)
sites/<siteId>/snapshots/<snapId>/   ← immutable versions (NOT for public serving)
```
Only `live/` should ever be publicly reachable; never expose `snapshots/` or bucket listing.

---

## 4. Wildcard domain `*.web.sh`

You need DNS + TLS for the apex `web.sh` and wildcard `*.web.sh`, routed to the serving path. `VITE_SUBDOMAIN_ROOT` must equal the root (default `web.sh`) — it's used both to mint `domain` at site creation and to parse the `Host` in `/api/serve/$`.

**Option A — Vercel-native (recommended to launch):**
- Add `web.sh` and `*.web.sh` as domains on the Vercel project; complete Vercel's DNS verification (nameservers or the CNAME/TXT it gives you). Vercel provisions the wildcard cert.
- The §2 rewrite routes them to `/api/serve/$`. Done.

**Option B — Cloudflare in front (optimize later):**
- Proxy `*.web.sh` through Cloudflare (wildcard cert handled by CF) to the Vercel origin, keeping `Host`. Same `/api/serve` path runs.
- For best performance, replace the function hop with a **Worker that reads R2 directly**. The Worker must (a) map `<sub>.web.sh` → `siteId`, and (b) serve **only** `sites/<siteId>/live/<path>` (never `snapshots/`, never listing). The subdomain→siteId map isn't in R2, so back it with **Workers KV** (write `subdomain→siteId` on site creation / first deploy) or a tiny internal lookup endpoint on the app. Until that exists, Option A is correct.

Either way: **`vetka.sh/api/agent/deploy` must be publicly reachable from the open internet** — the Anthropic agent sandbox curls it (see §5).

---

## 5. Anthropic Managed Agent

Code: `src/lib/agent.server.ts` (constants, overridable by env), `scripts/create-environment.mjs`, `scripts/update-agent.mjs`. Current IDs (already provisioned, version 14): `AGENT_ID=agent_019VzGQn8ggkHmQxrDrHcJjU`, `ENV_ID=env_01AKeJed2CAzKMdAMmQ3zTnN`. Model is **`claude-sonnet-4-6`**.

1. Set `ANTHROPIC_API_KEY` in the app env. Optionally override `ANTHROPIC_AGENT_ID` / `ANTHROPIC_ENV_ID`.
2. **Re-run the config scripts whenever they change** (they're already applied for v14, but re-run if you fork the agent/env):
   - `node scripts/update-agent.mjs` — sets system prompt, model, and the `get_deploy_credentials` custom tool.
   - `node scripts/create-environment.mjs` — installs `curl`/`unzip`/`ca-certificates`; the agent installs `bun` on demand.
3. **Networking** (`create-environment.mjs` `config.networking`): currently `unrestricted`. For production prefer `limited` with an explicit `allowed_hosts` and `allow_package_managers: true`. The allow-list MUST include:
   - the app host that serves the deploy relay (e.g. `vetka.sh`) — **the deploy will fail without this**,
   - `bun.sh` (to install bun) and the package registries bun pulls from (`registry.npmjs.org`, etc.) — or just `allow_package_managers: true`.
4. Sanity check after setup: `client.beta.agents.retrieve(AGENT_ID)` should show `model.id = claude-sonnet-4-6` and a `custom:get_deploy_credentials` tool.

**Deploy auth model (important):** the agent never holds a long-lived secret. It calls `get_deploy_credentials` (serviced in `src/routes/api/agent/stream.ts`), which mints a short-lived per-site token (`deploy_token` table, default 2h, hash-stored — `src/lib/deploy-token.server.ts`) and returns `{deploy_url, token, ...}`. The agent POSTs files to `deploy_url` with `Authorization: Bearer <token>`. Expired → `401 {code:"token_expired"}` → agent refreshes via the tool. No infra action needed; just ensure the relay host is reachable + allow-listed.

---

## 6. Auth providers + email

Passwordless: **email OTP**, **Google**, **GitHub** (`src/lib/auth.server.ts`). Each social provider activates only when its `*_CLIENT_ID` is set.

- **Email OTP:** create a **Resend** API key and a verified sender; set `RESEND_API_KEY` and `EMAIL_FROM` (e.g. `Vetka <login@vetka.sh>`). Without `RESEND_API_KEY` codes are console-logged (dev only — do not ship without it). Add the sending domain's SPF/DKIM in DNS per Resend.
- **Google OAuth:** create an OAuth client; authorized redirect URI `https://vetka.sh/api/auth/callback/google`. Set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
- **GitHub OAuth:** create an OAuth app; callback `https://vetka.sh/api/auth/callback/github`. Set `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`.
- `BETTER_AUTH_URL` and `VITE_APP_URL` = `https://vetka.sh`; generate `BETTER_AUTH_SECRET` (`openssl rand -base64 32`). `trustedOrigins` in `auth.server.ts` already lists vetka.sh — add any extra origins there if needed.

---

## 7. Complete env-var reference

| Var | Where | Required | Notes |
|---|---|---|---|
| `DATABASE_URL` | app | ✅ | Postgres (Aiven). |
| `BETTER_AUTH_SECRET` | app | ✅ | `openssl rand -base64 32`. |
| `BETTER_AUTH_URL` | app | ✅ | `https://vetka.sh`. |
| `VITE_APP_URL` | app | ✅ | `https://vetka.sh`. |
| `VITE_SUBDOMAIN_ROOT` | app | ✅ | `web.sh`. |
| `ANTHROPIC_API_KEY` | app | ✅ | Managed Agents. |
| `ANTHROPIC_AGENT_ID` / `ANTHROPIC_ENV_ID` | app | ➖ | Override built-in IDs if forking. |
| `R2_ENDPOINT` / `R2_BUCKET` | app | ✅ (prod) | Selects the `s3` storage driver. |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | app | ✅ (prod) | Scoped R2 token. |
| `STORAGE_DRIVER` / `STORAGE_LOCAL_DIR` | app | ➖ | `local` is the dev default. |
| `RESEND_API_KEY` / `EMAIL_FROM` | app | ✅ (prod) | OTP email delivery. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | app | ➖ | Enables Google login. |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | app | ➖ | Enables GitHub login. |

(`S3_ENDPOINT`/`S3_BUCKET`/`S3_REGION`/`AWS_*` are accepted alternatives to the `R2_*` names if you use AWS S3 instead.)

---

## 8. Security checklist (don't skip)

- [ ] R2 bucket **private**; public access + listing **disabled**; R2 token scoped to the one bucket.
- [ ] Only `sites/<id>/live/` is publicly reachable; `snapshots/` never is.
- [ ] Agent env on `limited` networking with a minimal `allowed_hosts` (relay host + package registries).
- [ ] Deploy relay is HTTPS and the only deploy path; tokens are short-lived (2h) and hash-stored — no infra change needed, just don't widen the TTL casually.
- [ ] Real `RESEND_API_KEY` set (no console-only OTP in prod).
- [ ] Consider abuse/takedown for user-generated `*.web.sh` sites (phishing/malware) and a CSP on served pages.

---

## 9. End-to-end verification

1. Visit `https://vetka.sh`, sign in via email OTP (check inbox), and via Google/GitHub.
2. `/setup` → "Generate a new site" → pick a subdomain → lands in the builder.
3. In the builder, ask the agent to build a simple page. Confirm it calls `get_deploy_credentials` and the deploy returns `{ok:true,...}`.
4. Open `https://<subdomain>.web.sh` — the built site loads. Hard-refresh a deep path to confirm SPA fallback.
5. Builder "Versions" tab shows the snapshot; make a second change, then **roll back** and confirm the live site reverts.
6. Confirm `snapshots/` and bucket listing are not publicly accessible.

---

## Open follow-ups (not blockers)
- Worker + KV direct-from-R2 serving (§4 Option B) for scale.
- Re-hydrate the agent sandbox from the latest snapshot when a session resumes after long idle (otherwise `/workspace` source may be gone; deployed files are always safe in R2).
- Screenshot capture into `site_image` (currently stubbed) for feed thumbnails.

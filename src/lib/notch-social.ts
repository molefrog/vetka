// Shared helpers for the Notch social API routes (src/routes/api/notch/*).
//
// Notch embeds on arbitrary third-party sites and calls these endpoints with
// `credentials: 'include'`, so every route needs the same CORS treatment as
// `api/notch/me.ts` (reflect Origin, allow credentials, handle OPTIONS).
//
// The social graph is keyed by `site.id` — a user acts in it through the first
// `site` they own. Display fields (name/handle/avatar) are *derived* from the
// owning `user` and the site's domain; there is no profile table.

import { inArray, eq } from 'drizzle-orm'
import { auth } from './auth.server'
import { db } from '../db'
import { site, user } from '../db/schema'

// --- CORS -------------------------------------------------------------------
//
// The Notch widget is served onto *registered* site domains (an external site
// pastes the script on its own domain; a generated site is served from its
// *.vetka.sh subdomain). So the only legitimate cross-origin callers are
// registered site domains. We reflect the caller's Origin (required for
// credentialed requests — `*` is rejected when credentials are sent) ONLY when
// it resolves to a registered site (or is same-origin). An arbitrary attacker
// page therefore receives no CORS grant, which blocks silent cross-site reads.

// True when `origin`'s hostname belongs to a registered site.
async function isRegisteredOrigin(origin: string): Promise<boolean> {
  let host: string
  try {
    host = new URL(origin).hostname
  } catch {
    return false
  }
  const candidates = [host, host.replace(/^www\./, '')]
  const rows = await db
    .select({ id: site.id })
    .from(site)
    .where(inArray(site.domain, candidates))
    .limit(1)
  return rows.length > 0
}

// Returns the Origin to reflect, or null when the request should get no CORS
// grant. `null` also covers same-origin / non-browser callers (no Origin
// header) — those need no CORS headers and are allowed.
export async function allowedOrigin(request: Request): Promise<string | null> {
  const origin = request.headers.get('Origin')
  if (!origin) return null
  try {
    if (new URL(origin).host === new URL(request.url).host) return origin
  } catch {
    return null
  }
  return (await isRegisteredOrigin(origin)) ? origin : null
}

// Guard for state-changing requests: rejects credentialed cross-site POST/DELETE
// from origins that aren't registered sites (CSRF defense). Same-origin and
// non-browser callers (no Origin header) pass.
export async function isAllowedRequest(request: Request): Promise<boolean> {
  if (!request.headers.get('Origin')) return true
  return (await allowedOrigin(request)) !== null
}

export async function corsHeaders(request: Request): Promise<HeadersInit> {
  const origin = await allowedOrigin(request)
  const headers: Record<string, string> = { Vary: 'Origin' }
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin
    headers['Access-Control-Allow-Credentials'] = 'true'
    headers['Access-Control-Allow-Methods'] = 'GET, POST, DELETE, OPTIONS'
    headers['Access-Control-Allow-Headers'] = 'Content-Type'
  }
  return headers
}

export async function corsJson(request: Request, body: unknown, init?: ResponseInit) {
  return Response.json(body, { ...init, headers: await corsHeaders(request) })
}

export async function corsOptions(request: Request) {
  return new Response(null, { status: 204, headers: await corsHeaders(request) })
}

// --- viewer (current user + their acting site) ------------------------------

// Note: email is deliberately NOT included — these values reach cross-origin
// Notch responses and email is PII the widget never needs.
export type Viewer = {
  user: { id: string; name: string; image: string | null }
  site: typeof site.$inferSelect | null
}

// The logged-in user and the first `site` they own (their identity in the
// site-keyed graph). Returns null when logged out.
export async function getViewer(request: Request): Promise<Viewer | null> {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session?.user) return null

  const rows = await db.select().from(site).where(eq(site.userId, session.user.id)).limit(1)
  return {
    user: {
      id: session.user.id,
      name: session.user.name,
      image: session.user.image ?? null,
    },
    site: rows[0] ?? null,
  }
}

// --- derived site profiles --------------------------------------------------

export type SiteProfile = {
  id: string // site.id — the canonical peer/follow id
  name: string
  image: string | null
  handle: string // "@handle" — derived, never null
  seed: string // stable facehash seed (the domain)
}

function deriveHandle(domain: string): string {
  // The domain's first label, e.g. "maya.dev" -> "@maya".
  const slug = domain.replace(/^https?:\/\//, '').split('.')[0] || domain
  return `@${slug}`
}

// Batch-resolve display profiles for a set of site ids. Used by every list
// endpoint so rows render real names/handles/avatars without a profile table.
export async function siteProfiles(siteIds: string[]): Promise<Map<string, SiteProfile>> {
  const map = new Map<string, SiteProfile>()
  const ids = [...new Set(siteIds)]
  if (ids.length === 0) return map

  const rows = await db
    .select({
      id: site.id,
      domain: site.domain,
      name: user.name,
      image: user.image,
    })
    .from(site)
    .leftJoin(user, eq(site.userId, user.id))
    .where(inArray(site.id, ids))

  for (const r of rows) {
    map.set(r.id, {
      id: r.id,
      name: r.name ?? r.domain,
      image: r.image ?? null,
      handle: deriveHandle(r.domain),
      seed: r.domain,
    })
  }
  return map
}

export async function siteProfile(siteId: string): Promise<SiteProfile | null> {
  const map = await siteProfiles([siteId])
  return map.get(siteId) ?? null
}

// --- misc -------------------------------------------------------------------

// Short relative label matching the widget's `Conversation.time` shape.
export function relativeTime(date: Date): string {
  const secs = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000))
  if (secs < 60) return 'now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  const weeks = Math.floor(days / 7)
  return `${weeks}w`
}

// Resolve a registered site id from an arbitrary page URL's hostname, if any.
export async function siteIdForUrl(pageUrl: string): Promise<string | null> {
  let host: string
  try {
    host = new URL(pageUrl).hostname
  } catch {
    return null
  }
  const candidates = [host, host.replace(/^www\./, '')]
  const rows = await db
    .select({ id: site.id })
    .from(site)
    .where(inArray(site.domain, candidates))
    .limit(1)
  return rows[0]?.id ?? null
}

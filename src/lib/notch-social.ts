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

// Reflect the caller's Origin (required for credentialed cross-origin requests
// — `*` is rejected by browsers when credentials are sent).
export function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get('Origin') ?? ''
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  }
}

export function corsJson(request: Request, body: unknown, init?: ResponseInit) {
  return Response.json(body, { ...init, headers: corsHeaders(request) })
}

export function corsOptions(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) })
}

// --- viewer (current user + their acting site) ------------------------------

export type Viewer = {
  user: { id: string; name: string; email: string; image: string | null }
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
      email: session.user.email,
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

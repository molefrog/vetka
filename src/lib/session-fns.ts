import { createServerFn } from '@tanstack/react-start'

// ---------------------------------------------------------------------------
// better-auth session — the current logged-in user (email OTP or Google)
// ---------------------------------------------------------------------------

export const getAuthSession = createServerFn({ method: 'GET' }).handler(async () => {
  const { getRequest } = await import('@tanstack/react-start/server')
  const { auth } = await import('./auth.server')
  return auth.api.getSession({ headers: getRequest().headers })
})

// ---------------------------------------------------------------------------
// Sites — the social entity
// ---------------------------------------------------------------------------

export const getUserSites = createServerFn({ method: 'GET' }).handler(async () => {
  const { getRequest } = await import('@tanstack/react-start/server')
  const { auth } = await import('./auth.server')
  const session = await auth.api.getSession({ headers: getRequest().headers })
  if (!session?.user) return []

  const { db } = await import('../db')
  const { site } = await import('../db/schema')
  const { eq } = await import('drizzle-orm')

  return db.select().from(site).where(eq(site.userId, session.user.id))
})

export const getUserSite = createServerFn({ method: 'GET' }).handler(async () => {
  const { getRequest } = await import('@tanstack/react-start/server')
  const { auth } = await import('./auth.server')
  const session = await auth.api.getSession({ headers: getRequest().headers })
  if (!session?.user) return null

  const { db } = await import('../db')
  const { site } = await import('../db/schema')
  const { eq } = await import('drizzle-orm')

  const rows = await db.select().from(site).where(eq(site.userId, session.user.id)).limit(1)
  return rows[0] ?? null
})

export const createSite = createServerFn({ method: 'POST' })
  .validator(
    (d: {
      domain: string
      kind?: 'external' | 'generated'
      subdomain?: string
    }) => d,
  )
  .handler(async ({ data }) => {
    const { getRequest } = await import('@tanstack/react-start/server')
    const { auth } = await import('./auth.server')
    const session = await auth.api.getSession({ headers: getRequest().headers })
    if (!session?.user) throw new Error('Not authenticated')

    const { db } = await import('../db')
    const { site } = await import('../db/schema')
    const { eq, sql } = await import('drizzle-orm')
    const kind = data.kind ?? 'external'

    // Validate the subdomain server-side for generated sites (the UI calls
    // checkSubdomain, but that guard must not be the only one). Reuse the same
    // format regex + reserved list.
    if (kind === 'generated') {
      const sub = (data.subdomain ?? '').trim().toLowerCase()
      if (!SUBDOMAIN_RE.test(sub) || RESERVED_SUBDOMAINS.has(sub)) {
        throw new Error('Invalid subdomain')
      }
    }

    // Ownership guard: a domain already claimed by someone else must not be
    // reassigned to the caller (prevents site takeover via upsert).
    const [existing] = await db
      .select({ id: site.id, userId: site.userId })
      .from(site)
      .where(eq(site.domain, data.domain))
      .limit(1)
    if (existing && existing.userId !== session.user.id) {
      throw new Error('Domain already registered')
    }

    // One site per user: block creating a second, distinct site.
    if (!existing) {
      const [own] = await db
        .select({ id: site.id })
        .from(site)
        .where(eq(site.userId, session.user.id))
        .limit(1)
      if (own) throw new Error('You already have a site')
    }

    const [created] = await db
      .insert(site)
      .values({
        domain: data.domain,
        userId: session.user.id,
        kind,
        subdomain: data.subdomain ?? null,
        status: 'draft',
      })
      .onConflictDoUpdate({
        // Same-owner re-submit updates in place. userId is intentionally NOT in
        // the update set — ownership can never change through this path.
        target: site.domain,
        set: {
          kind,
          subdomain: data.subdomain ?? null,
          updatedAt: sql`now()`,
        },
      })
      .returning()

    return created
  })

// Generated sites live on a wildcard subdomain. SUBDOMAIN_ROOT defaults to
// "web.sh" so a chosen label "evan" maps to "evan.web.sh".
export const SUBDOMAIN_ROOT = import.meta.env.VITE_SUBDOMAIN_ROOT ?? 'web.sh'

export const SUBDOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

// Reserve hostnames we use ourselves so a generated site can't shadow them.
const RESERVED_SUBDOMAINS = new Set(['www', 'api', 'app', 'admin', 'vetka', 'mail', 'ftp', 'web'])

export const checkSubdomain = createServerFn({ method: 'GET' })
  .validator((label: string) => label)
  .handler(async ({ data: label }) => {
    const sub = label.trim().toLowerCase()
    if (!SUBDOMAIN_RE.test(sub) || RESERVED_SUBDOMAINS.has(sub)) {
      return { available: false as const, reason: 'invalid' as const }
    }
    const { db } = await import('../db')
    const { site } = await import('../db/schema')
    const { eq } = await import('drizzle-orm')
    const [taken] = await db.select({ id: site.id }).from(site).where(eq(site.subdomain, sub)).limit(1)
    return taken ? { available: false as const, reason: 'taken' as const } : { available: true as const }
  })

// ---------------------------------------------------------------------------
// Public data — no auth required
// ---------------------------------------------------------------------------

export const getRecentMembers = createServerFn({ method: 'GET' }).handler(async () => {
  const { db } = await import('../db')
  const { site } = await import('../db/schema')
  const { desc } = await import('drizzle-orm')

  const rows = await db.select({ domain: site.domain }).from(site).orderBy(desc(site.createdAt)).limit(8)
  return rows.map((r) => r.domain)
})

// ---------------------------------------------------------------------------
// Post-login redirect — decides where to send the user after auth
// ---------------------------------------------------------------------------

export const getPostLoginDestination = createServerFn({ method: 'GET' }).handler(async () => {
  const { getRequest } = await import('@tanstack/react-start/server')
  const { auth } = await import('./auth.server')
  const session = await auth.api.getSession({ headers: getRequest().headers })
  if (!session?.user) return '/' as const

  const { db } = await import('../db')
  const { site } = await import('../db/schema')
  const { eq } = await import('drizzle-orm')

  // Already has a site → hub. Otherwise let them pick how to get one.
  const sites = await db.select({ id: site.id }).from(site).where(eq(site.userId, session.user.id)).limit(1)
  if (sites.length > 0) return '/' as const

  return '/setup' as const
})

import { createServerFn } from '@tanstack/react-start'

// ---------------------------------------------------------------------------
// better-auth session — works for ALL users including Tangled
// ---------------------------------------------------------------------------

export const getAuthSession = createServerFn({ method: 'GET' }).handler(async () => {
  const { getRequest } = await import('@tanstack/react-start/server')
  const { auth } = await import('./auth.server')
  return auth.api.getSession({ headers: getRequest().headers })
})

// ---------------------------------------------------------------------------
// Tangled identity — linked to the current better-auth user
// ---------------------------------------------------------------------------

export const getTangledIdentity = createServerFn({ method: 'GET' }).handler(async () => {
  const { getRequest } = await import('@tanstack/react-start/server')
  const { auth } = await import('./auth.server')
  const session = await auth.api.getSession({ headers: getRequest().headers })
  if (!session?.user) return null

  const { db } = await import('../db')
  const { tangledIdentity } = await import('../db/schema')
  const { eq } = await import('drizzle-orm')

  const rows = await db
    .select()
    .from(tangledIdentity)
    .where(eq(tangledIdentity.userId, session.user.id))
    .limit(1)

  return rows[0] ?? null
})

export const saveSelectedRepo = createServerFn({ method: 'POST' })
  .validator((d: { uri: string; name: string; knot: string }) => d)
  .handler(async ({ data }) => {
    const { getRequest } = await import('@tanstack/react-start/server')
    const { auth } = await import('./auth.server')
    const session = await auth.api.getSession({ headers: getRequest().headers })
    if (!session?.user) throw new Error('Not authenticated')

    const { db } = await import('../db')
    const { tangledIdentity } = await import('../db/schema')
    const { eq } = await import('drizzle-orm')

    await db
      .update(tangledIdentity)
      .set({
        selectedRepoUri: data.uri,
        selectedRepoName: data.name,
        selectedRepoKnot: data.knot,
        updatedAt: new Date(),
      })
      .where(eq(tangledIdentity.userId, session.user.id))
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
      isTangled: boolean
      did?: string
      repoUri?: string
      repoName?: string
      repoKnot?: string
    }) => d,
  )
  .handler(async ({ data }) => {
    const { getRequest } = await import('@tanstack/react-start/server')
    const { auth } = await import('./auth.server')
    const session = await auth.api.getSession({ headers: getRequest().headers })
    if (!session?.user) throw new Error('Not authenticated')

    const { db } = await import('../db')
    const { site } = await import('../db/schema')

    const { sql } = await import('drizzle-orm')
    const [created] = await db
      .insert(site)
      .values({
        domain: data.domain,
        userId: session.user.id,
        isTangled: data.isTangled,
        did: data.did,
        repoUri: data.repoUri,
        repoName: data.repoName,
        repoKnot: data.repoKnot,
        status: 'draft',
      })
      .onConflictDoUpdate({
        target: site.domain,
        set: {
          userId: session.user.id,
          isTangled: data.isTangled,
          did: data.did,
          repoUri: data.repoUri,
          repoName: data.repoName,
          repoKnot: data.repoKnot,
          updatedAt: sql`now()`,
        },
      })
      .returning()

    return created
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
  const { site, tangledIdentity } = await import('../db/schema')
  const { eq } = await import('drizzle-orm')

  const sites = await db.select().from(site).where(eq(site.userId, session.user.id)).limit(1)
  if (sites.length > 0) return '/' as const

  const tangled = await db
    .select()
    .from(tangledIdentity)
    .where(eq(tangledIdentity.userId, session.user.id))
    .limit(1)

  return tangled.length > 0 ? ('/setup/tangled' as const) : ('/setup/script' as const)
})

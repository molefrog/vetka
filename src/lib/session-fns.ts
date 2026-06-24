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

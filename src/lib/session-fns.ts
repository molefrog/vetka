import { createServerFn } from '@tanstack/react-start'

const TANGLED_COOKIE = 'tangled_session'

async function hashToken(token: string) {
  const { createHash } = await import('node:crypto')
  return createHash('sha256').update(token).digest('hex')
}

// ---------------------------------------------------------------------------
// Regular (better-auth) session
// ---------------------------------------------------------------------------

export const getAuthSession = createServerFn({ method: 'GET' }).handler(async () => {
  const { getRequest } = await import('@tanstack/react-start/server')
  const { auth } = await import('./auth.server')
  return auth.api.getSession({ headers: getRequest().headers })
})

// ---------------------------------------------------------------------------
// Tangled session
// ---------------------------------------------------------------------------

export const createTangledSession = createServerFn({ method: 'POST' })
  .validator((d: { did: string; handle: string }) => d)
  .handler(async ({ data }) => {
    const { setCookie } = await import('@tanstack/react-start/server')
    const { db } = await import('../db')
    const { tangledIdentity, tangledSession } = await import('../db/schema')
    const { randomUUID } = await import('node:crypto')

    await db
      .insert(tangledIdentity)
      .values({ did: data.did, handle: data.handle })
      .onConflictDoUpdate({
        target: tangledIdentity.did,
        set: { handle: data.handle, updatedAt: new Date() },
      })

    const token = randomUUID()
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

    await db.insert(tangledSession).values({
      did: data.did,
      token: await hashToken(token),
      expiresAt,
    })

    setCookie(TANGLED_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
    })

    return { did: data.did, handle: data.handle }
  })

export const getTangledSession = createServerFn({ method: 'GET' }).handler(async () => {
  const { getCookie } = await import('@tanstack/react-start/server')
  const token = getCookie(TANGLED_COOKIE)
  if (!token) return null

  const { db } = await import('../db')
  const { tangledSession, tangledIdentity } = await import('../db/schema')
  const { eq, and, gt } = await import('drizzle-orm')

  const rows = await db
    .select({
      did: tangledSession.did,
      handle: tangledIdentity.handle,
      selectedRepoUri: tangledIdentity.selectedRepoUri,
      selectedRepoName: tangledIdentity.selectedRepoName,
      selectedRepoKnot: tangledIdentity.selectedRepoKnot,
    })
    .from(tangledSession)
    .innerJoin(tangledIdentity, eq(tangledSession.did, tangledIdentity.did))
    .where(
      and(
        eq(tangledSession.token, await hashToken(token)),
        gt(tangledSession.expiresAt, new Date()),
      ),
    )
    .limit(1)

  return rows[0] ?? null
})

export const deleteTangledSession = createServerFn({ method: 'POST' }).handler(async () => {
  const { getCookie, deleteCookie } = await import('@tanstack/react-start/server')
  const token = getCookie(TANGLED_COOKIE)
  if (token) {
    const { db } = await import('../db')
    const { tangledSession } = await import('../db/schema')
    const { eq } = await import('drizzle-orm')
    await db.delete(tangledSession).where(eq(tangledSession.token, await hashToken(token)))
  }
  deleteCookie(TANGLED_COOKIE, { path: '/' })
})

export const saveSelectedRepo = createServerFn({ method: 'POST' })
  .validator((d: { uri: string; name: string; knot: string }) => d)
  .handler(async ({ data }) => {
    const { getCookie } = await import('@tanstack/react-start/server')
    const token = getCookie(TANGLED_COOKIE)
    if (!token) throw new Error('Not authenticated')

    const { db } = await import('../db')
    const { tangledSession, tangledIdentity } = await import('../db/schema')
    const { eq, and, gt } = await import('drizzle-orm')

    const rows = await db
      .select({ did: tangledSession.did })
      .from(tangledSession)
      .where(
        and(
          eq(tangledSession.token, await hashToken(token)),
          gt(tangledSession.expiresAt, new Date()),
        ),
      )
      .limit(1)

    if (!rows[0]) throw new Error('Session expired')

    await db
      .update(tangledIdentity)
      .set({
        selectedRepoUri: data.uri,
        selectedRepoName: data.name,
        selectedRepoKnot: data.knot,
        updatedAt: new Date(),
      })
      .where(eq(tangledIdentity.did, rows[0].did))
  })

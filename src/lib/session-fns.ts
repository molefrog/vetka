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

// Generates (or reuses) the SSH keypair for this user's Tangled identity,
// uploads it to the Files API so it can be mounted into agent sessions,
// and returns the public key so the caller can register it with Tangled.
export const provisionSshKey = createServerFn({ method: 'POST' }).handler(async () => {
  const { getRequest } = await import('@tanstack/react-start/server')
  const { auth } = await import('./auth.server')
  const session = await auth.api.getSession({ headers: getRequest().headers })
  if (!session?.user) throw new Error('Not authenticated')

  const { db } = await import('../db')
  const { tangledIdentity } = await import('../db/schema')
  const { eq } = await import('drizzle-orm')

  const [identity] = await db
    .select()
    .from(tangledIdentity)
    .where(eq(tangledIdentity.userId, session.user.id))
    .limit(1)

  if (!identity) throw new Error('No Tangled identity found')

  // Re-use the existing key if already provisioned
  if (identity.sshPrivateKey && identity.sshPublicKey) {
    return { sshPublicKey: identity.sshPublicKey }
  }

  // Generate a fresh OpenSSH-format Ed25519 keypair
  const { generateSSHKeyPair, uploadSshKeyToFiles } = await import('./agent.server')
  const { privateKey, publicKey } = generateSSHKeyPair()
  const fileId = await uploadSshKeyToFiles(privateKey)

  await db
    .update(tangledIdentity)
    .set({ sshPrivateKey: privateKey, sshPublicKey: publicKey, sshKeyFileId: fileId, updatedAt: new Date() })
    .where(eq(tangledIdentity.userId, session.user.id))

  return { sshPublicKey: publicKey }
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
  const { tangledIdentity } = await import('../db/schema')
  const { eq } = await import('drizzle-orm')

  const tangled = await db
    .select()
    .from(tangledIdentity)
    .where(eq(tangledIdentity.userId, session.user.id))
    .limit(1)

  // Always send Tangled users through setup so SSH keys are always provisioned.
  if (tangled.length > 0) return '/setup/tangled' as const

  return '/setup/script' as const
})

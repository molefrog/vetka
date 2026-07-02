import { createServerFn } from '@tanstack/react-start'

export const getBuilderSiteData = createServerFn({ method: 'GET' })
  .validator((domain: string) => domain)
  .handler(async ({ data: domain }) => {
    const { getRequest } = await import('@tanstack/react-start/server')
    const { auth } = await import('./auth.server')
    const session = await auth.api.getSession({ headers: getRequest().headers })
    if (!session?.user) return null

    const { db } = await import('../db')
    const { site } = await import('../db/schema')
    const { and, eq } = await import('drizzle-orm')

    // Ownership guard: only the owner may load their builder's site data.
    const [siteRow] = await db
      .select({
        kind: site.kind,
        subdomain: site.subdomain,
        status: site.status,
      })
      .from(site)
      .where(and(eq(site.domain, domain), eq(site.userId, session.user.id)))
      .limit(1)

    return siteRow ?? null
  })

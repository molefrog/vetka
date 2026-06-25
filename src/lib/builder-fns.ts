import { createServerFn } from '@tanstack/react-start'

export const getBuilderSiteData = createServerFn({ method: 'GET' })
  .validator((domain: string) => domain)
  .handler(async ({ data: domain }) => {
    const { db } = await import('../db')
    const { site } = await import('../db/schema')
    const { eq } = await import('drizzle-orm')

    const [siteRow] = await db
      .select({
        isTangled: site.isTangled,
        repoName: site.repoName,
        repoKnot: site.repoKnot,
        status: site.status,
      })
      .from(site)
      .where(eq(site.domain, domain))
      .limit(1)

    return siteRow ?? null
  })

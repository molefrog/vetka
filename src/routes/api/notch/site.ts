import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { db } from '../../../db'
import { site } from '../../../db/schema'
import { corsJson, corsOptions, getViewer, siteProfile } from '../../../lib/notch-social'

// Resolve the host site the widget is embedded on (by domain) so the widget can
// tell owner from visitor and surface the owner's identity for "message the owner".
export const Route = createFileRoute('/api/notch/site')({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsOptions(request),

      GET: async ({ request }) => {
        const domain = new URL(request.url).searchParams.get('domain') ?? ''
        if (!domain) return corsJson(request, { site: null })

        const rows = await db.select().from(site).where(eq(site.domain, domain)).limit(1)
        const host = rows[0]
        if (!host) return corsJson(request, { site: null })

        const viewer = await getViewer(request)
        const owner = await siteProfile(host.id)

        return corsJson(request, {
          site: { id: host.id, domain: host.domain },
          owner,
          viewerIsOwner: viewer?.site?.id === host.id,
          viewerSiteId: viewer?.site?.id ?? null,
        })
      },
    },
  },
})

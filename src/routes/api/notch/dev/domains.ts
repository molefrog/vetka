import { createFileRoute } from '@tanstack/react-router'
import { desc } from 'drizzle-orm'
import { db } from '../../../../db'
import { site } from '../../../../db/schema'
import { corsJson, corsOptions, getViewer } from '../../../../lib/notch-social'

// GET /api/notch/dev/domains — dev-only helper that returns a handful of
// registered site domains so the /notch/test page can build a domain picker.
// Returns up to 6 domains, flagging which one belongs to the logged-in user.
export const Route = createFileRoute('/api/notch/dev/domains')({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsOptions(request),

      GET: async ({ request }) => {
        const viewer = await getViewer(request)
        const viewerSiteId = viewer?.site?.id ?? null

        const rows = await db
          .select({ id: site.id, domain: site.domain })
          .from(site)
          .orderBy(desc(site.createdAt))
          .limit(6)

        const domains = rows.map((r) => ({
          domain: r.domain,
          mine: r.id === viewerSiteId,
        }))

        // Put the viewer's own site first
        domains.sort((a, b) => (a.mine === b.mine ? 0 : a.mine ? -1 : 1))

        return corsJson(request, domains)
      },
    },
  },
})

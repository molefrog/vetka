import { createFileRoute } from '@tanstack/react-router'
import { desc, inArray } from 'drizzle-orm'
import { db } from '../../db'
import { site, siteImage } from '../../db/schema'
import { corsJson, corsOptions } from '../../lib/notch-social'

// GET /api/feed — the global feed: live sites that have at least one page
// snapshot, most-recently-updated first. Each item carries a bit of info about
// the person plus their domain, from which the home page derives the snapshot
// image (GET /api/sites/$domain/snapshot).
//
// Display name + action are derived here (no name column is populated yet):
// the person's name lives in the domain slug (e.g. dasha-volkova.vercel.app).

function displayName(domain: string): string {
  const label = domain.split('.')[0] // strip TLD/host → "dasha-volkova"
  const words = label
    .split('-')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
  return words.join(' ') || domain
}

function relativeTime(d: Date): string {
  const secs = Math.max(0, (Date.now() - d.getTime()) / 1000)
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export const Route = createFileRoute('/api/feed')({
  server: {
    handlers: {
      // The Notch widget reads this cross-origin from third-party host pages.
      OPTIONS: async ({ request }) => corsOptions(request),

      GET: async ({ request }) => {
        // Sites that actually have a snapshot image.
        const sitesWithImage = db
          .selectDistinct({ siteId: siteImage.siteId })
          .from(siteImage)

        const rows = await db
          .select({
            domain: site.domain,
            status: site.status,
            updatedAt: site.updatedAt,
          })
          .from(site)
          .where(inArray(site.id, sitesWithImage))
          .orderBy(desc(site.updatedAt))
          .limit(50)

        const items = rows.map((r) => ({
          name: displayName(r.domain),
          domain: r.domain,
          action: r.status === 'live' ? 'Updated their site' : 'Joined Vetka',
          time: relativeTime(r.updatedAt),
        }))

        return corsJson(request, { items })
      },
    },
  },
})

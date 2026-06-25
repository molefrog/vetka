import { createFileRoute } from '@tanstack/react-router'
import { desc, eq } from 'drizzle-orm'
import { db } from '../../../../db'
import { site, siteImage } from '../../../../db/schema'

// GET /api/sites/$domain/snapshot
// Streams the most recent page snapshot (site_image blob) for a site, by domain.
// Used by the home global feed to attach a live preview of each followed site.
//
// Snapshot capture is still being wired up (siteSnapshot.imageId is a stub), so a
// site may have no image row yet — we 404 in that case and the feed shows a
// "Snapshot coming soon" placeholder until the first capture lands.
export const Route = createFileRoute('/api/sites/$domain/snapshot')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const domain = params.domain
        if (!domain) return new Response('missing domain', { status: 400 })

        const [host] = await db
          .select({ id: site.id })
          .from(site)
          .where(eq(site.domain, domain))
          .limit(1)
        if (!host) return new Response('no such site', { status: 404 })

        // Most recent image is the "current" thumbnail (schema convention).
        const [img] = await db
          .select({
            data: siteImage.data,
            mimeType: siteImage.mimeType,
            byteSize: siteImage.byteSize,
          })
          .from(siteImage)
          .where(eq(siteImage.siteId, host.id))
          .orderBy(desc(siteImage.createdAt))
          .limit(1)
        if (!img) return new Response('no snapshot yet', { status: 404 })

        return new Response(new Uint8Array(img.data), {
          headers: {
            'Content-Type': img.mimeType,
            'Content-Length': String(img.byteSize),
            // Snapshots refresh on each build; keep the cache short.
            'Cache-Control': 'public, max-age=60',
          },
        })
      },
    },
  },
})

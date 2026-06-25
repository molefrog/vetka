import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { db } from '../../../../../db'
import { message, site } from '../../../../../db/schema'
import { corsJson, corsOptions, getViewer } from '../../../../../lib/notch-social'

// POST /api/notch/conversations/$peerId/messages { text } — send a DM.
export const Route = createFileRoute('/api/notch/conversations/$peerId/messages')({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsOptions(request),

      POST: async ({ request, params }) => {
        const viewer = await getViewer(request)
        if (!viewer) return corsJson(request, { error: 'unauthorized' }, { status: 401 })
        if (!viewer.site) return corsJson(request, { needsSite: true }, { status: 409 })

        const peerId = params.peerId
        const { text } = (await request.json().catch(() => ({}))) as { text?: string }
        const body = text?.trim()
        if (!body) return corsJson(request, { error: 'empty' }, { status: 400 })

        // Guard against dangling references — the peer site must exist.
        const peer = await db.select({ id: site.id }).from(site).where(eq(site.id, peerId)).limit(1)
        if (!peer[0]) return corsJson(request, { error: 'no_such_peer' }, { status: 404 })

        const [created] = await db
          .insert(message)
          .values({ fromId: viewer.site.id, toId: peerId, body })
          .returning()

        return corsJson(request, {
          id: created.id,
          fromMe: true,
          text: created.body,
          createdAt: created.createdAt.toISOString(),
        })
      },
    },
  },
})

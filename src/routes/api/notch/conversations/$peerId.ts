import { createFileRoute } from '@tanstack/react-router'
import { and, asc, eq, isNull, or } from 'drizzle-orm'
import { db } from '../../../../db'
import { message } from '../../../../db/schema'
import {
  corsJson,
  corsOptions,
  getViewer,
  siteProfile,
} from '../../../../lib/notch-social'

// GET /api/notch/conversations/$peerId — the full thread with one peer.
// Opening the thread marks the peer's inbound messages as read.
export const Route = createFileRoute('/api/notch/conversations/$peerId')({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsOptions(request),

      GET: async ({ request, params }) => {
        const viewer = await getViewer(request)
        if (!viewer?.site) return corsJson(request, { needsSite: true }, { status: 409 })
        const me = viewer.site.id
        const peerId = params.peerId

        const rows = await db
          .select()
          .from(message)
          .where(
            or(
              and(eq(message.fromId, me), eq(message.toId, peerId)),
              and(eq(message.fromId, peerId), eq(message.toId, me)),
            ),
          )
          .orderBy(asc(message.createdAt))

        // Mark the peer's messages to me as read.
        await db
          .update(message)
          .set({ readAt: new Date() })
          .where(
            and(
              eq(message.fromId, peerId),
              eq(message.toId, me),
              isNull(message.readAt),
            ),
          )

        const peer = await siteProfile(peerId)
        const messages = rows.map((m) => ({
          id: m.id,
          fromMe: m.fromId === me,
          text: m.body,
          createdAt: m.createdAt.toISOString(),
        }))

        return corsJson(request, { peer, messages })
      },
    },
  },
})

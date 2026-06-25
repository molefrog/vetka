import { createFileRoute } from '@tanstack/react-router'
import { desc, eq, or } from 'drizzle-orm'
import { db } from '../../../db'
import { message } from '../../../db/schema'
import {
  corsJson,
  corsOptions,
  getViewer,
  relativeTime,
  siteProfiles,
} from '../../../lib/notch-social'

// GET /api/notch/conversations — the viewer's DM threads, one row per peer,
// each with a last-message preview, relative time, and unread flag.
export const Route = createFileRoute('/api/notch/conversations')({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsOptions(request),

      GET: async ({ request }) => {
        const viewer = await getViewer(request)
        if (!viewer?.site) return corsJson(request, { conversations: [], unreadCount: 0 })
        const me = viewer.site.id

        // All messages I'm party to, newest first.
        const rows = await db
          .select()
          .from(message)
          .where(or(eq(message.fromId, me), eq(message.toId, me)))
          .orderBy(desc(message.createdAt))

        // Collapse to one entry per peer (first seen = latest, since desc).
        type Entry = { peerId: string; last: typeof rows[number]; unread: boolean }
        const byPeer = new Map<string, Entry>()
        for (const m of rows) {
          const peerId = m.fromId === me ? m.toId : m.fromId
          const inboundUnread = m.toId === me && m.readAt === null
          const existing = byPeer.get(peerId)
          if (!existing) {
            byPeer.set(peerId, { peerId, last: m, unread: inboundUnread })
          } else if (inboundUnread) {
            existing.unread = true
          }
        }

        const entries = [...byPeer.values()]
        const profiles = await siteProfiles(entries.map((e) => e.peerId))

        const conversations = entries.map((e) => {
          const p = profiles.get(e.peerId)
          const mine = e.last.fromId === me
          return {
            id: e.peerId,
            name: p?.name ?? 'Unknown',
            seed: p?.seed ?? e.peerId,
            image: p?.image ?? null,
            handle: p?.handle ?? '',
            preview: mine ? `You: ${e.last.body}` : e.last.body,
            time: relativeTime(e.last.createdAt),
            unread: e.unread,
            lastMessageAt: e.last.createdAt.toISOString(),
          }
        })

        const unreadCount = conversations.filter((c) => c.unread).length
        return corsJson(request, { conversations, unreadCount })
      },
    },
  },
})

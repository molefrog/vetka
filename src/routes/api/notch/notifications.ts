import { createFileRoute } from '@tanstack/react-router'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { db } from '../../../db'
import { follow, message } from '../../../db/schema'
import {
  corsJson,
  corsOptions,
  getViewer,
  siteProfiles,
} from '../../../lib/notch-social'

// GET /api/notch/notifications — derived (no table): unread DM count plus a
// merged recent stream of inbound follows and reactions on the viewer's pages.
export const Route = createFileRoute('/api/notch/notifications')({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsOptions(request),

      GET: async ({ request }) => {
        const viewer = await getViewer(request)
        if (!viewer?.site) return corsJson(request, { unreadCount: 0, items: [] })
        const me = viewer.site.id

        // Unread inbound DMs.
        const unread = await db
          .select({ id: message.id })
          .from(message)
          .where(and(eq(message.toId, me), isNull(message.readAt)))

        // Recent new followers.
        const follows = await db
          .select({ followerId: follow.followerId, createdAt: follow.createdAt })
          .from(follow)
          .where(eq(follow.followeeId, me))
          .orderBy(desc(follow.createdAt))
          .limit(20)

        const followerProfiles = await siteProfiles(follows.map((f) => f.followerId))

        const items = follows
          .map((f) => {
            const p = followerProfiles.get(f.followerId)
            return {
              type: 'follow' as const,
              text: 'followed you',
              actor: {
                name: p?.name ?? 'Someone',
                image: p?.image ?? null,
                seed: p?.seed ?? f.followerId,
              },
              createdAt: f.createdAt.toISOString(),
            }
          })
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 20)

        return corsJson(request, { unreadCount: unread.length, items })
      },
    },
  },
})

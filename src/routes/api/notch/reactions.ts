import { createFileRoute } from '@tanstack/react-router'
import { asc, eq } from 'drizzle-orm'
import { db } from '../../../db'
import { reaction, user } from '../../../db/schema'
import {
  corsJson,
  corsOptions,
  getViewer,
  siteIdForUrl,
} from '../../../lib/notch-social'

// GET  /api/notch/reactions?url=<pageUrl> — emoji stamps pinned to a page.
// POST /api/notch/reactions { url, emoji, x, y, body? } — drop a stamp.
export const Route = createFileRoute('/api/notch/reactions')({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsOptions(request),

      GET: async ({ request }) => {
        const url = new URL(request.url).searchParams.get('url') ?? ''
        if (!url) return corsJson(request, { reactions: [] })

        const rows = await db
          .select({
            id: reaction.id,
            emoji: reaction.emoji,
            x: reaction.x,
            y: reaction.y,
            body: reaction.body,
            createdAt: reaction.createdAt,
            authorUserId: reaction.authorUserId,
            authorName: user.name,
            authorImage: user.image,
          })
          .from(reaction)
          .leftJoin(user, eq(reaction.authorUserId, user.id))
          .where(eq(reaction.pageUrl, url))
          .orderBy(asc(reaction.createdAt))

        const reactions = rows.map((r) => ({
          id: r.id,
          emoji: r.emoji,
          x: r.x,
          y: r.y,
          body: r.body,
          createdAt: r.createdAt.toISOString(),
          author: {
            name: r.authorName ?? 'Someone',
            image: r.authorImage ?? null,
            seed: r.authorUserId,
          },
        }))

        return corsJson(request, { reactions })
      },

      POST: async ({ request }) => {
        const viewer = await getViewer(request)
        if (!viewer) return corsJson(request, { error: 'unauthorized' }, { status: 401 })

        const { url, emoji, x, y, body } = (await request.json().catch(() => ({}))) as {
          url?: string
          emoji?: string
          x?: number
          y?: number
          body?: string
        }
        if (!url || !emoji || typeof x !== 'number' || typeof y !== 'number') {
          return corsJson(request, { error: 'bad_request' }, { status: 400 })
        }

        const siteId = await siteIdForUrl(url)
        const [created] = await db
          .insert(reaction)
          .values({
            pageUrl: url,
            siteId,
            authorUserId: viewer.user.id,
            emoji,
            x,
            y,
            body: body ?? null,
          })
          .returning()

        return corsJson(request, {
          id: created.id,
          emoji: created.emoji,
          x: created.x,
          y: created.y,
          body: created.body,
          createdAt: created.createdAt.toISOString(),
          author: {
            name: viewer.user.name,
            image: viewer.user.image,
            seed: viewer.user.id,
          },
        })
      },
    },
  },
})

import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { db } from '../../../db'
import { follow } from '../../../db/schema'
import {
  corsJson,
  corsOptions,
  getViewer,
  siteProfiles,
} from '../../../lib/notch-social'

// GET /api/notch/followers?of=<siteId> — accounts that follow <of>.
export const Route = createFileRoute('/api/notch/followers')({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsOptions(request),

      GET: async ({ request }) => {
        const viewer = await getViewer(request)
        const of = new URL(request.url).searchParams.get('of') ?? viewer?.site?.id ?? ''
        if (!of) return corsJson(request, { followers: [], count: 0 })

        // Who follows <of>.
        const edges = await db
          .select({ followerId: follow.followerId })
          .from(follow)
          .where(eq(follow.followeeId, of))
        const ids = edges.map((e) => e.followerId)

        // Which followers the viewer follows back (button state).
        const viewerFollowing = new Set<string>()
        if (viewer?.site) {
          const mine = await db
            .select({ followeeId: follow.followeeId })
            .from(follow)
            .where(eq(follow.followerId, viewer.site.id))
          for (const m of mine) viewerFollowing.add(m.followeeId)
        }

        const profiles = await siteProfiles(ids)
        const followers = ids
          .map((id) => profiles.get(id))
          .filter((p): p is NonNullable<typeof p> => !!p)
          .map((p) => ({
            id: p.id,
            name: p.name,
            seed: p.seed,
            handle: p.handle,
            image: p.image,
            following: viewerFollowing.has(p.id),
          }))

        return corsJson(request, { followers, count: followers.length })
      },
    },
  },
})

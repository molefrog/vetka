import { createFileRoute } from '@tanstack/react-router'
import { and, eq } from 'drizzle-orm'
import { db } from '../../../db'
import { follow } from '../../../db/schema'
import {
  corsJson,
  corsOptions,
  getViewer,
  siteProfiles,
} from '../../../lib/notch-social'

// GET    /api/notch/follows?of=<siteId>  — accounts that <of> follows
// POST   /api/notch/follows  { followeeId }   — viewer follows a site
// DELETE /api/notch/follows?followeeId=<id>    — viewer unfollows a site
export const Route = createFileRoute('/api/notch/follows')({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsOptions(request),

      GET: async ({ request }) => {
        const viewer = await getViewer(request)
        const of = new URL(request.url).searchParams.get('of') ?? viewer?.site?.id ?? ''
        if (!of) return corsJson(request, { follows: [], count: 0 })

        // Who <of> follows.
        const edges = await db
          .select({ followeeId: follow.followeeId })
          .from(follow)
          .where(eq(follow.followerId, of))
        const ids = edges.map((e) => e.followeeId)

        // Which of those the *viewer* already follows (drives the button state).
        const viewerFollowing = new Set<string>()
        if (viewer?.site) {
          const mine = await db
            .select({ followeeId: follow.followeeId })
            .from(follow)
            .where(eq(follow.followerId, viewer.site.id))
          for (const m of mine) viewerFollowing.add(m.followeeId)
        }

        const profiles = await siteProfiles(ids)
        const follows = ids
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

        return corsJson(request, { follows, count: follows.length })
      },

      POST: async ({ request }) => {
        const viewer = await getViewer(request)
        if (!viewer) return corsJson(request, { error: 'unauthorized' }, { status: 401 })
        if (!viewer.site) return corsJson(request, { needsSite: true }, { status: 409 })

        const { followeeId } = (await request.json().catch(() => ({}))) as {
          followeeId?: string
        }
        if (!followeeId || followeeId === viewer.site.id) {
          return corsJson(request, { error: 'bad_request' }, { status: 400 })
        }

        await db
          .insert(follow)
          .values({ followerId: viewer.site.id, followeeId })
          .onConflictDoNothing()

        return corsJson(request, { following: true })
      },

      DELETE: async ({ request }) => {
        const viewer = await getViewer(request)
        if (!viewer) return corsJson(request, { error: 'unauthorized' }, { status: 401 })
        if (!viewer.site) return corsJson(request, { needsSite: true }, { status: 409 })

        const followeeId = new URL(request.url).searchParams.get('followeeId') ?? ''
        if (!followeeId) return corsJson(request, { error: 'bad_request' }, { status: 400 })

        await db
          .delete(follow)
          .where(
            and(eq(follow.followerId, viewer.site.id), eq(follow.followeeId, followeeId)),
          )

        return corsJson(request, { following: false })
      },
    },
  },
})

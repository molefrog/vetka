import { createFileRoute } from '@tanstack/react-router'
import { and, eq } from 'drizzle-orm'
import { db } from '../../../db'
import { follow } from '../../../db/schema'
import {
  corsJson,
  corsOptions,
  getViewer,
  isAllowedRequest,
  siteProfiles,
} from '../../../lib/notch-social'

// GET    /api/notch/follows?of=<siteId>          — accounts that <of> follows
// POST   /api/notch/follows  { followeeId, on }   — viewer follows (on!==false) or
//                                                   unfollows (on===false) a site
// DELETE /api/notch/follows?followeeId=<id>        — legacy unfollow (kept for compat)
//
// POST is sent cross-site as a CORS-"simple" request (text/plain body) so it
// needs no preflight — see notch/src/follows-data.ts. It carries both follow and
// unfollow because DELETE is never a simple request and its preflight is blocked.
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
        if (!(await isAllowedRequest(request))) {
          return corsJson(request, { error: 'forbidden_origin' }, { status: 403 })
        }
        const viewer = await getViewer(request)
        if (!viewer) return corsJson(request, { error: 'unauthorized' }, { status: 401 })
        if (!viewer.site) return corsJson(request, { needsSite: true }, { status: 409 })

        // Body arrives as text/plain (simple request) but is JSON — request.json()
        // parses it regardless of Content-Type.
        const { followeeId, on } = (await request.json().catch(() => ({}))) as {
          followeeId?: string
          on?: boolean
        }
        if (!followeeId || followeeId === viewer.site.id) {
          return corsJson(request, { error: 'bad_request' }, { status: 400 })
        }

        // on === false → unfollow; otherwise follow (default).
        if (on === false) {
          await db
            .delete(follow)
            .where(
              and(eq(follow.followerId, viewer.site.id), eq(follow.followeeId, followeeId)),
            )
          return corsJson(request, { following: false })
        }

        await db
          .insert(follow)
          .values({ followerId: viewer.site.id, followeeId })
          .onConflictDoNothing()

        return corsJson(request, { following: true })
      },

      DELETE: async ({ request }) => {
        if (!(await isAllowedRequest(request))) {
          return corsJson(request, { error: 'forbidden_origin' }, { status: 403 })
        }
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

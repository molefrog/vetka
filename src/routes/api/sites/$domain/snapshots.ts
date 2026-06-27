import { createFileRoute } from '@tanstack/react-router'
import { and, desc, eq } from 'drizzle-orm'
import { auth } from '../../../../lib/auth.server'
import { db } from '../../../../db'
import { site, siteSnapshot } from '../../../../db/schema'

// GET  /api/sites/$domain/snapshots         → list deploy snapshots (newest first)
// POST /api/sites/$domain/snapshots {id}    → roll back to a snapshot
// Both require the caller to own the site.
async function ownedSite(request: Request, domain: string) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session?.user) return { error: 'Unauthorized' as const, status: 401 }
  const [row] = await db.select().from(site).where(eq(site.domain, domain)).limit(1)
  if (!row) return { error: 'Site not found' as const, status: 404 }
  if (row.userId !== session.user.id) return { error: 'Forbidden' as const, status: 403 }
  return { site: row }
}

export const Route = createFileRoute('/api/sites/$domain/snapshots')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const owned = await ownedSite(request, params.domain)
        if ('error' in owned) return Response.json({ error: owned.error }, { status: owned.status })

        const rows = await db
          .select({
            id: siteSnapshot.id,
            status: siteSnapshot.status,
            message: siteSnapshot.message,
            fileCount: siteSnapshot.fileCount,
            byteSize: siteSnapshot.byteSize,
            triggeredBy: siteSnapshot.triggeredBy,
            createdAt: siteSnapshot.createdAt,
          })
          .from(siteSnapshot)
          .where(eq(siteSnapshot.siteId, owned.site.id))
          .orderBy(desc(siteSnapshot.createdAt))
          .limit(50)

        return Response.json({ snapshots: rows, liveSnapshotId: owned.site.liveSnapshotId })
      },

      POST: async ({ request, params }) => {
        const owned = await ownedSite(request, params.domain)
        if ('error' in owned) return Response.json({ error: owned.error }, { status: owned.status })

        const { id } = (await request.json().catch(() => ({}))) as { id?: string }
        if (!id) return Response.json({ ok: false, error: 'Missing snapshot id' }, { status: 400 })

        // Make sure the snapshot belongs to this site before rolling back.
        const [snap] = await db
          .select({ id: siteSnapshot.id })
          .from(siteSnapshot)
          .where(and(eq(siteSnapshot.id, id), eq(siteSnapshot.siteId, owned.site.id)))
          .limit(1)
        if (!snap) return Response.json({ ok: false, error: 'Snapshot not found' }, { status: 404 })

        const { rollbackSite } = await import('../../../../lib/deploy.server')
        const result = await rollbackSite(owned.site.id, id)
        return Response.json(result, { status: result.ok ? 200 : 500 })
      },
    },
  },
})

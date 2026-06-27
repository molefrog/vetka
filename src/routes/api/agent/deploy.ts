import { createFileRoute } from '@tanstack/react-router'
import { eq, and } from 'drizzle-orm'
import { db } from '../../../db'
import { agentSession, site } from '../../../db/schema'

// POST /api/agent/deploy
// Called by the build agent (not the browser) to publish a generated site.
// Auth: Bearer <managed-agent session id>. Body: JSON
//   { "files": [{ "path": "index.html", "contentBase64": "..." }, ...], "message"?: "..." }
// Publishes the files to storage as a new immutable snapshot and points the
// site's live version at it. Returns { ok, url, snapshotId, fileCount }.
export const Route = createFileRoute('/api/agent/deploy')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const sessionId = request.headers.get('Authorization')?.replace(/^Bearer\s+/, '').trim()
        if (!sessionId) {
          return Response.json({ ok: false, error: 'Missing Authorization header' }, { status: 401 })
        }

        const [sess] = await db
          .select()
          .from(agentSession)
          .where(eq(agentSession.sessionId, sessionId))
          .limit(1)
        if (!sess) {
          return Response.json({ ok: false, error: 'Invalid session token' }, { status: 401 })
        }

        const [siteRow] = await db
          .select({ id: site.id })
          .from(site)
          .where(and(eq(site.userId, sess.userId), eq(site.kind, 'generated')))
          .limit(1)
        if (!siteRow) {
          return Response.json({ ok: false, error: 'No generated site for this user' }, { status: 404 })
        }

        let payload: { files?: Array<{ path?: string; contentBase64?: string }>; message?: string }
        try {
          payload = await request.json()
        } catch {
          return Response.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
        }

        const files = (payload.files ?? [])
          .filter((f): f is { path: string; contentBase64: string } => !!f.path && typeof f.contentBase64 === 'string')
          .map((f) => ({ path: f.path, content: Buffer.from(f.contentBase64, 'base64') }))
        if (!files.length) {
          return Response.json({ ok: false, error: 'No files provided' }, { status: 400 })
        }

        const { deploySite } = await import('../../../lib/deploy.server')
        const result = await deploySite(siteRow.id, files, { message: payload.message, triggeredBy: 'agent' })
        return Response.json(result, { status: result.ok ? 200 : 500 })
      },
    },
  },
})

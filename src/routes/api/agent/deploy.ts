import { createFileRoute } from '@tanstack/react-router'
import { eq, and } from 'drizzle-orm'
import { db } from '../../../db'
import { agentSession, site } from '../../../db/schema'

// POST /api/agent/deploy
// Called by the build agent (not the browser) to publish a generated site.
// Auth: Bearer <managed-agent session id>. Body: JSON
//   { "siteId": "<uuid>", "files": [{ "path": "index.html", "contentBase64": "..." }, ...], "message"?: "..." }
// The agent gets its target siteId from the <vetka_context> block injected into
// each message. We resolve the deploy target explicitly by that id and verify it
// belongs to the authenticated session's user (and is a generated site) — never
// trusting the agent to deploy to an arbitrary site. Publishes the files to
// storage as a new immutable snapshot and points the live version at it.
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

        let payload: { siteId?: string; files?: Array<{ path?: string; contentBase64?: string }>; message?: string }
        try {
          payload = await request.json()
        } catch {
          return Response.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
        }

        // Resolve the target site by the explicit siteId when provided (validated
        // against the session's user), else fall back to the user's single
        // generated site. Either way the site must belong to this user.
        const ownership = payload.siteId
          ? and(eq(site.id, payload.siteId), eq(site.userId, sess.userId), eq(site.kind, 'generated'))
          : and(eq(site.userId, sess.userId), eq(site.kind, 'generated'))
        const [siteRow] = await db.select({ id: site.id }).from(site).where(ownership).limit(1)
        if (!siteRow) {
          return Response.json(
            { ok: false, error: payload.siteId ? 'Site not found for this user' : 'No generated site for this user' },
            { status: 404 },
          )
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

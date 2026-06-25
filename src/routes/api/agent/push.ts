import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { db } from '../../../db'
import { agentSession } from '../../../db/schema'
export const Route = createFileRoute('/api/agent/push')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get('Authorization')
        const sessionId = authHeader?.replace(/^Bearer\s+/, '').trim()
        if (!sessionId) {
          return Response.json({ error: 'Missing Authorization header' }, { status: 401 })
        }

        const [sess] = await db
          .select()
          .from(agentSession)
          .where(eq(agentSession.sessionId, sessionId))
          .limit(1)

        if (!sess?.sshPrivateKey) {
          return Response.json({ error: 'Invalid token or no SSH key configured' }, { status: 401 })
        }

        const formData = await request.formData()
        const bundleFile = formData.get('bundle') as File | null
        if (!bundleFile) {
          return Response.json({ error: 'No bundle provided' }, { status: 400 })
        }

        const { pushBundle } = await import('../../../lib/push.server')
        const result = await pushBundle(Buffer.from(await bundleFile.arrayBuffer()), sess.userId)
        return Response.json(result, { status: 'error' in result ? 500 : 200 })
      },
    },
  },
})

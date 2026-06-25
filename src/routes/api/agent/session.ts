import { createFileRoute } from '@tanstack/react-router'
import { auth } from '../../../lib/auth.server'
import { getOrCreateSession } from '../../../lib/agent.server'

export const Route = createFileRoute('/api/agent/session')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers })
        if (!session?.user) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const sessionId = await getOrCreateSession(session.user.id)
        return Response.json({ sessionId })
      },
    },
  },
})

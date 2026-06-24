import { createAPIFileRoute } from '@tanstack/react-start/api'
import { auth } from '../../../lib/auth.server'
import { getOrCreateSession } from '../../../lib/agent.server'

export const APIRoute = createAPIFileRoute('/api/agent/session')({
  GET: async ({ request }) => {
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session?.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const sessionId = await getOrCreateSession(session.user.id)
    return Response.json({ sessionId })
  },
})

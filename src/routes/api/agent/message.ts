import { createFileRoute } from '@tanstack/react-router'
import { auth } from '../../../lib/auth.server'
import { getAnthropicClient, getOrCreateSession } from '../../../lib/agent.server'

export const Route = createFileRoute('/api/agent/message')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers })
        if (!session?.user) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { text } = await request.json()
        if (!text?.trim()) {
          return Response.json({ error: 'No message' }, { status: 400 })
        }

        const sessionId = await getOrCreateSession(session.user.id)
        const client = getAnthropicClient()

        await client.beta.sessions.events.send(sessionId, {
          events: [
            {
              type: 'user.message',
              content: [{ type: 'text', text }],
            },
          ],
        })

        return Response.json({ ok: true })
      },
    },
  },
})

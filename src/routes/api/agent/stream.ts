import { createAPIFileRoute } from '@tanstack/react-start/api'
import { auth } from '../../../lib/auth.server'
import { getAnthropicClient, getOrCreateSession } from '../../../lib/agent.server'

export const APIRoute = createAPIFileRoute('/api/agent/stream')({
  GET: async ({ request }) => {
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session?.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const sessionId = await getOrCreateSession(session.user.id)
    const client = getAnthropicClient()

    const encoder = new TextEncoder()

    const body = new ReadableStream({
      async start(controller) {
        function send(event: string, data: unknown) {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        }

        try {
          // Send past events first
          const history = await client.beta.sessions.events.list(sessionId, { limit: 200 })
          for (const evt of history.data.reverse()) {
            send('history', evt)
          }
          send('history_end', {})

          // Stream live events
          const stream = client.beta.sessions.events.stream(sessionId)
          for await (const evt of await stream) {
            send('event', evt)
            if (
              evt.type === 'session.status_terminated' ||
              evt.type === 'session.deleted'
            ) {
              break
            }
          }
        } catch (err) {
          send('error', { message: String(err) })
        } finally {
          controller.close()
        }
      },
    })

    return new Response(body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  },
})

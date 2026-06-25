import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { auth } from '../../../lib/auth.server'
import { getAnthropicClient } from '../../../lib/agent.server'
import { db } from '../../../db'
import { tangledIdentity } from '../../../db/schema'

function extractBlockText(content: Array<{ type: string; text?: string }> | null | undefined): string {
  return (content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n')
}

export const Route = createFileRoute('/api/agent/stream')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authSession = await auth.api.getSession({ headers: request.headers })
        if (!authSession?.user) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { sessionId, message } = await request.json()
        if (!sessionId || !message?.trim()) {
          return Response.json({ error: 'Missing sessionId or message' }, { status: 400 })
        }

        const userId = authSession.user.id

        const identityRows = await db
          .select()
          .from(tangledIdentity)
          .where(eq(tangledIdentity.userId, userId))
          .limit(1)

        const identity = identityRows[0]

        let contextBlock = ''
        if (identity?.selectedRepoName && identity?.selectedRepoKnot) {
          const httpsUrl = `https://tangled.org/${identity.handle}/${identity.selectedRepoName}`
          const prodUrl = `https://${identity.handle}`
          contextBlock =
            `<vetka_context>\n` +
            `repo: ${httpsUrl}\n` +
            `prod: ${prodUrl}\n` +
            `IMPORTANT: SSH port 22 is blocked. Use HTTPS for all git operations.\n` +
            `Clone with: git clone ${httpsUrl}\n` +
            `For push, ask the user for their Tangled app password, then:\n` +
            `git remote set-url origin https://${identity.handle}:APP_PASSWORD@tangled.org/${identity.handle}/${identity.selectedRepoName}\n` +
            `</vetka_context>\n`
        }

        const fullMessage = contextBlock + message

        const client = getAnthropicClient()
        const encoder = new TextEncoder()

        const body = new ReadableStream({
          async start(controller) {
            function send(data: object) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
            }

            try {
              await client.beta.sessions.events.send(sessionId, {
                events: [{ type: 'user.message', content: [{ type: 'text', text: fullMessage }] }],
              })

              const stream = client.beta.sessions.events.stream(sessionId)
              for await (const evt of await stream) {
                const e = evt as any

                if (evt.type === 'agent.thinking') {
                  send({ type: 'thinking' })
                } else if (evt.type === 'agent.message') {
                  for (const block of evt.content ?? []) {
                    if (block.type === 'text' && block.text) {
                      send({ type: 'text', text: block.text })
                    }
                  }
                } else if (evt.type === 'agent.tool_use') {
                  send({ type: 'tool_use', id: evt.id, name: evt.name, input: evt.input })
                } else if (e.type === 'agent.mcp_tool_use') {
                  send({ type: 'tool_use', id: e.id, name: `${e.mcp_server_name}:${e.name}`, input: e.input })
                } else if (e.type === 'agent.custom_tool_use') {
                  send({ type: 'tool_use', id: e.id, name: e.name, input: e.input })
                } else if (e.type === 'agent.tool_result') {
                  send({ type: 'tool_result', tool_use_id: e.tool_use_id, output: extractBlockText(e.content), is_error: !!e.is_error })
                } else if (e.type === 'agent.mcp_tool_result') {
                  send({ type: 'tool_result', tool_use_id: e.mcp_tool_use_id, output: extractBlockText(e.content), is_error: !!e.is_error })
                }

                if (evt.type === 'session.status_idle' || (e.type as string) === 'session.thread_status_idle') break
                if (evt.type === 'session.status_terminated') {
                  send({ error: 'Session terminated' })
                  break
                }
              }

              send({ done: true })
            } catch (err) {
              send({ error: String(err) })
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
    },
  },
})

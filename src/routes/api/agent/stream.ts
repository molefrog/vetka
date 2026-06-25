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

        type ContentBlock =
          | { type: 'text'; text: string }
          | { type: 'image'; source: { type: 'file'; file_id: string } }
          | { type: 'document'; source: { type: 'file'; file_id: string } }

        const { sessionId, message, attachments } = await request.json() as {
          sessionId: string
          message: string
          attachments?: Array<{ file_id: string; mime_type: string; name?: string }>
        }
        if (!sessionId || (!message?.trim() && !attachments?.length)) {
          return Response.json({ error: 'Missing sessionId or message' }, { status: 400 })
        }

        const userId = authSession.user.id

        const identityRows = await db
          .select()
          .from(tangledIdentity)
          .where(eq(tangledIdentity.userId, userId))
          .limit(1)

        const identity = identityRows[0]

        const baseUrl = new URL(request.url).origin

        let contextBlock = ''
        if (identity?.selectedRepoName && identity?.selectedRepoKnot) {
          const httpsUrl = `https://tangled.org/${identity.handle}/${identity.selectedRepoName}`
          const prodUrl = `https://${identity.handle}`
          const pushRelay = `${baseUrl}/api/agent/push`
          contextBlock =
            `<vetka_context>\n` +
            `repo_https: ${httpsUrl}\n` +
            `prod: ${prodUrl}\n` +
            `Clone: git clone ${httpsUrl}\n` +
            `\n` +
            `To push commits, use the Vetka push relay (direct SSH is blocked in this sandbox):\n` +
            `  git bundle create /tmp/push.bundle origin/main..HEAD\n` +
            `  curl -sS -X POST ${pushRelay} \\\n` +
            `    -H "Authorization: Bearer ${sessionId}" \\\n` +
            `    -F bundle=@/tmp/push.bundle\n` +
            `  # Returns JSON: {"hash":"<commit-hash>","url":"${prodUrl}"}\n` +
            `  # After a successful push, run: git fetch origin && git reset --hard origin/main\n` +
            `</vetka_context>\n`
        }

        const textContent = contextBlock + message

        const client = getAnthropicClient()

        const content: Array<ContentBlock> = []
        if (textContent.trim()) content.push({ type: 'text', text: textContent })

        for (const att of attachments ?? []) {
          const ext = att.mime_type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'bin'
          const filename = att.name || `file.${ext}`
          // Use file_id as directory to avoid collisions on repeated sends in the same session
          const mountPath = `/${att.file_id}/${filename}`

          // Mount the file into the session sandbox so the agent can read/use it as a real file
          const resource = await (client.beta.sessions as any).resources.add(sessionId, {
            type: 'file',
            file_id: att.file_id,
            mount_path: mountPath,
          })
          // Use the path the API actually assigned, not what we requested
          const actualPath: string = resource.mount_path ?? mountPath

          if (att.mime_type.startsWith('image/')) {
            content.push({
              type: 'text',
              text: `[Image "${filename}" is available in the sandbox at ${actualPath}]`,
            })
            content.push({ type: 'image', source: { type: 'file', file_id: att.file_id } })
          } else {
            content.push({
              type: 'text',
              text: `[File "${filename}" is available in the sandbox at ${actualPath}]`,
            })
            content.push({ type: 'document', source: { type: 'file', file_id: att.file_id } })
          }
        }

        const encoder = new TextEncoder()

        const body = new ReadableStream({
          async start(controller) {
            function send(data: object) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
            }

            try {
              await client.beta.sessions.events.send(sessionId, {
                events: [{ type: 'user.message', content: content as any }],
              })

              // Loop to handle custom tool calls: stream → pause → execute tool → resume
              while (true) {
                type PendingTool = { id: string; name: string; input: Record<string, unknown> }
                let pendingCustomTool: PendingTool | null = null
                let terminated = false

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
                    pendingCustomTool = { id: e.id, name: e.name, input: e.input }
                    send({ type: 'tool_use', id: e.id, name: e.name, input: e.input })
                  } else if (e.type === 'agent.tool_result') {
                    send({ type: 'tool_result', tool_use_id: e.tool_use_id, output: extractBlockText(e.content), is_error: !!e.is_error })
                  } else if (e.type === 'agent.mcp_tool_result') {
                    send({ type: 'tool_result', tool_use_id: e.mcp_tool_use_id, output: extractBlockText(e.content), is_error: !!e.is_error })
                  }

                  if (evt.type === 'session.status_idle' || (e.type as string) === 'session.thread_status_idle') break
                  if (evt.type === 'session.status_terminated') {
                    terminated = true
                    send({ error: 'Session terminated' })
                    break
                  }
                }

                if (terminated) break

                // If the session paused for a push_repo custom tool call, execute it and loop
                if (pendingCustomTool?.name === 'push_repo') {
                  const { pushBundle } = await import('../../../lib/push.server')
                  const bundleB64 = pendingCustomTool.input.bundle_base64 as string
                  const bundleBytes = Buffer.from(bundleB64, 'base64')
                  const result = await pushBundle(bundleBytes, userId)

                  // Send tool result back to the Managed Agents session (resumes the agent)
                  await client.beta.sessions.events.send(sessionId, {
                    events: [{
                      type: 'user.custom_tool_result' as any,
                      custom_tool_use_id: pendingCustomTool.id,
                      content: [{ type: 'text', text: JSON.stringify(result) }],
                      is_error: 'error' in result,
                    }],
                  })

                  send({ type: 'tool_result', tool_use_id: pendingCustomTool.id, output: JSON.stringify(result), is_error: 'error' in result })
                  continue
                }

                break // no custom tool pending → agent is done
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

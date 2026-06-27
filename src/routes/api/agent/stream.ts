import { createFileRoute } from '@tanstack/react-router'
import { and, eq } from 'drizzle-orm'
import { auth } from '../../../lib/auth.server'
import { getAnthropicClient } from '../../../lib/agent.server'
import { db } from '../../../db'
import { site } from '../../../db/schema'

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

        const [generated] = await db
          .select({ id: site.id, domain: site.domain, subdomain: site.subdomain })
          .from(site)
          .where(and(eq(site.userId, userId), eq(site.kind, 'generated')))
          .limit(1)

        const baseUrl = new URL(request.url).origin

        let contextBlock = ''
        if (generated) {
          const prodUrl = `https://${generated.domain}`
          contextBlock =
            `<vetka_context>\n` +
            `site_id: ${generated.id}\n` +
            `prod: ${prodUrl}\n` +
            `You are building a static website that will be hosted at ${prodUrl}.\n` +
            `Work in /workspace. Use bun + React + Tailwind; install packages with bun add as needed.\n` +
            `Bundle the site to a dist/ directory of static files using bun's built-in bundler\n` +
            `(e.g. \`bun build ./src/index.html --outdir dist\`). dist/ MUST contain index.html.\n` +
            `\n` +
            `To deploy: call the get_deploy_credentials tool to get a short-lived deploy token\n` +
            `plus the deploy URL, then POST the built files (direct egress is limited — always use\n` +
            `this relay):\n` +
            `  cd dist && \\\n` +
            `  files=$(find . -type f | sed 's|^\\./||' | while read f; do \\\n` +
            `    printf '{"path":"%s","contentBase64":"%s"}\\n' "$f" "$(base64 -w0 "$f")"; \\\n` +
            `  done | paste -sd, -) && \\\n` +
            `  curl -sS -X POST <deploy_url from get_deploy_credentials> \\\n` +
            `    -H "Authorization: Bearer <token from get_deploy_credentials>" \\\n` +
            `    -H "Content-Type: application/json" \\\n` +
            `    -d "{\\"message\\":\\"<short summary>\\",\\"files\\":[$files]}"\n` +
            `  # Returns JSON: {"ok":true,"url":"${prodUrl}","snapshotId":"...","fileCount":N}\n` +
            `  # Tokens expire (~2h). If the relay returns 401 with code "token_expired",\n` +
            `  # call get_deploy_credentials again for a fresh token and retry.\n` +
            `  # Each successful deploy is saved as a rollback-able snapshot.\n` +
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

                // Service the get_deploy_credentials custom tool: mint a fresh,
                // short-lived deploy token for this user's generated site and hand
                // it back via the tool result (never in the prompt). The agent then
                // curls /api/agent/deploy with it. The browser sees a redacted
                // result so the token isn't rendered in the UI.
                if (pendingCustomTool?.name === 'get_deploy_credentials') {
                  let agentResult: object
                  let isError = false
                  if (!generated) {
                    agentResult = { error: 'No generated site for this user.' }
                    isError = true
                  } else {
                    const { mintDeployToken, DEPLOY_TOKEN_TTL_SECONDS } = await import('../../../lib/deploy-token.server')
                    const { token, expiresAt } = await mintDeployToken(generated.id)
                    agentResult = {
                      deploy_url: `${baseUrl}/api/agent/deploy`,
                      token,
                      expires_at: expiresAt.toISOString(),
                      ttl_seconds: DEPLOY_TOKEN_TTL_SECONDS,
                      site_id: generated.id,
                      prod_url: `https://${generated.domain}`,
                    }
                  }

                  await client.beta.sessions.events.send(sessionId, {
                    events: [{
                      type: 'user.custom_tool_result' as any,
                      custom_tool_use_id: pendingCustomTool.id,
                      content: [{ type: 'text', text: JSON.stringify(agentResult) }],
                      is_error: isError,
                    }],
                  })
                  // Redact the token from the client stream.
                  send({
                    type: 'tool_result',
                    tool_use_id: pendingCustomTool.id,
                    output: isError ? JSON.stringify(agentResult) : '[deploy credentials issued]',
                    is_error: isError,
                  })
                  continue
                }

                // Any other custom tool: resolve with guidance so the session doesn't hang.
                if (pendingCustomTool) {
                  const result = { error: 'Unknown tool. To publish, call get_deploy_credentials then POST /api/agent/deploy.' }
                  await client.beta.sessions.events.send(sessionId, {
                    events: [{
                      type: 'user.custom_tool_result' as any,
                      custom_tool_use_id: pendingCustomTool.id,
                      content: [{ type: 'text', text: JSON.stringify(result) }],
                      is_error: true,
                    }],
                  })
                  send({ type: 'tool_result', tool_use_id: pendingCustomTool.id, output: JSON.stringify(result), is_error: true })
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

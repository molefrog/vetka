import { createFileRoute } from '@tanstack/react-router'
import { auth } from '../../../lib/auth.server'
import { getAnthropicClient, getOrCreateSession } from '../../../lib/agent.server'

function extractBlockText(content: Array<{ type: string; text?: string }> | null | undefined): string {
  return (content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n')
}

function stripContextPrefix(text: string): string {
  return text.replace(/^<vetka_context>[\s\S]*?<\/vetka_context>\n?/, '')
}

export const Route = createFileRoute('/api/agent/session')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers })
        if (!session?.user) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { sessionId, sshPublicKey } = await getOrCreateSession(session.user.id)

        const client = getAnthropicClient()
        const rawEvents: Array<{ type: string; id?: string; processed_at: string; [k: string]: unknown }> = []
        for await (const evt of client.beta.sessions.events.list(sessionId)) {
          rawEvents.push(evt as typeof rawEvents[0])
          if (rawEvents.length >= 300) break
        }

        rawEvents.sort((a, b) => a.processed_at.localeCompare(b.processed_at))

        type ToolPart = { type: 'tool'; id: string; name: string; input: unknown; state: 'running' | 'done' | 'error'; output?: string }
        type Part = { type: 'text'; text: string } | ToolPart
        type Msg = { role: 'user'; text: string } | { role: 'assistant'; parts: Part[] }

        const messages: Msg[] = []
        let pendingTools: ToolPart[] = []

        for (const e of rawEvents) {
          if (e.type === 'user.message') {
            const rawText = extractBlockText(e.content as any)
            const text = stripContextPrefix(rawText)
            if (text.trim()) messages.push({ role: 'user', text })
            pendingTools = []
          } else if (e.type === 'agent.tool_use') {
            pendingTools.push({ type: 'tool', id: e.id!, name: e.name as string, input: e.input, state: 'running' })
          } else if (e.type === 'agent.mcp_tool_use') {
            pendingTools.push({ type: 'tool', id: e.id!, name: `${e.mcp_server_name}:${e.name}`, input: e.input, state: 'running' })
          } else if (e.type === 'agent.tool_result') {
            const tool = pendingTools.find((t) => t.id === e.tool_use_id)
            if (tool) { tool.state = e.is_error ? 'error' : 'done'; tool.output = extractBlockText(e.content as any) }
          } else if (e.type === 'agent.mcp_tool_result') {
            const tool = pendingTools.find((t) => t.id === e.mcp_tool_use_id)
            if (tool) { tool.state = e.is_error ? 'error' : 'done'; tool.output = extractBlockText(e.content as any) }
          } else if (e.type === 'agent.message') {
            const text = extractBlockText(e.content as any)
            const parts: Part[] = [...pendingTools]
            if (text) parts.push({ type: 'text', text })
            if (parts.length > 0) messages.push({ role: 'assistant', parts })
            pendingTools = []
          }
        }

        return Response.json({ sessionId, sshPublicKey, history: messages })
      },
    },
  },
})

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

        const { sessionId } = await getOrCreateSession(session.user.id)

        const client = getAnthropicClient()
        const rawEvents: Array<{ type: string; id?: string; processed_at: string; [k: string]: unknown }> = []
        for await (const evt of client.beta.sessions.events.list(sessionId)) {
          rawEvents.push(evt as typeof rawEvents[0])
          if (rawEvents.length >= 300) break
        }

        rawEvents.sort((a, b) => a.processed_at.localeCompare(b.processed_at))

        type ToolPart = { type: 'tool'; id: string; name: string; input: unknown; state: 'running' | 'done' | 'error'; output?: string }
        type ImagePart = { type: 'image'; file_id: string }
        type Part = { type: 'text'; text: string } | ImagePart | ToolPart
        type Msg = { role: 'user'; text: string; images?: ImagePart[] } | { role: 'assistant'; parts: Part[] }

        const messages: Msg[] = []
        let pendingTools: ToolPart[] = []

        for (const e of rawEvents) {
          if (e.type === 'user.message') {
            const blocks = (e.content ?? []) as Array<{ type: string; text?: string; source?: { type: string; file_id?: string } }>
            const rawText = blocks.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n')
            const text = stripContextPrefix(rawText)
            const images: ImagePart[] = blocks
              .filter((b) => b.type === 'image' && b.source?.type === 'file' && b.source.file_id)
              .map((b) => ({ type: 'image' as const, file_id: b.source!.file_id! }))
            if (text.trim() || images.length) messages.push({ role: 'user', text, images: images.length ? images : undefined })
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
            const blocks = (e.content ?? []) as Array<{ type: string; text?: string; source?: { type: string; file_id?: string } }>
            const parts: Part[] = [...pendingTools]
            for (const b of blocks) {
              if (b.type === 'text' && b.text) parts.push({ type: 'text', text: b.text })
              else if (b.type === 'image' && b.source?.type === 'file' && b.source.file_id) {
                parts.push({ type: 'image', file_id: b.source.file_id })
              }
            }
            if (parts.length > 0) messages.push({ role: 'assistant', parts })
            pendingTools = []
          }
        }

        return Response.json({ sessionId, history: messages })
      },
    },
  },
})

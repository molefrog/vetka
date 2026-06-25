import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { getAuthSession } from '../../../lib/session-fns'

export const Route = createFileRoute('/sites/$domain/builder')({
  beforeLoad: async () => {
    const session = await getAuthSession()
    if (!session?.user) throw redirect({ to: '/' })
  },
  component: BuilderPage,
})

type Message = { role: 'user' | 'assistant'; content: string }

function BuilderPage() {
  const { domain } = Route.useParams()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamBuffer, setStreamBuffer] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`/api/agent/session?domain=${encodeURIComponent(domain)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.sessionId) setSessionId(data.sessionId)
      })
  }, [domain])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamBuffer])

  async function send() {
    const text = input.trim()
    if (!text || !sessionId || streaming) return
    setInput('')
    setMessages((m) => [...m, { role: 'user', content: text }])
    setStreaming(true)
    setStreamBuffer('')

    try {
      const res = await fetch('/api/agent/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: text }),
      })

      if (!res.ok || !res.body) throw new Error('Stream failed')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue
          try {
            const parsed = JSON.parse(line.slice(6)) as { text?: string; done?: boolean; error?: string }
            if (parsed.text) {
              accumulated += parsed.text
              setStreamBuffer(accumulated)
            }
            if (parsed.done || parsed.error) break
          } catch {}
        }
      }

      setMessages((m) => [...m, { role: 'assistant', content: accumulated }])
      setStreamBuffer('')
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: '(Error — please try again)' }])
    } finally {
      setStreaming(false)
    }
  }

  const siteUrl = domain.includes('.') ? `https://${domain}` : null

  return (
    <div className="h-screen flex overflow-hidden bg-white">
      {/* Left: site preview */}
      <div className="flex-1 border-r border-zinc-200 flex flex-col">
        <div className="px-4 py-2 border-b border-zinc-200 flex items-center gap-2">
          <span className="text-xs text-zinc-500 truncate">{domain}</span>
          {siteUrl && (
            <a
              href={siteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-zinc-400 hover:text-zinc-700 ml-auto shrink-0"
            >
              Open ↗
            </a>
          )}
        </div>
        {siteUrl ? (
          <iframe
            src={siteUrl}
            className="flex-1 w-full border-0"
            title={domain}
            sandbox="allow-scripts allow-same-origin allow-forms"
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-zinc-400">
            No site preview available
          </div>
        )}
      </div>

      {/* Right: chat */}
      <div className="w-[480px] flex flex-col">
        <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
          <span className="text-sm font-medium">Builder</span>
          <a href="/sites" className="text-xs text-zinc-400 hover:text-zinc-700">Sites</a>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.length === 0 && !streamBuffer && (
            <p className="text-xs text-zinc-400">
              Tell me what you&apos;d like to do with your site.
            </p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`text-sm rounded-lg px-3 py-2 ${
                m.role === 'user'
                  ? 'bg-zinc-900 text-white ml-4'
                  : 'bg-zinc-100 text-zinc-900 mr-4'
              }`}
            >
              {m.content}
            </div>
          ))}
          {streamBuffer && (
            <div className="text-sm rounded-lg px-3 py-2 bg-zinc-100 text-zinc-900 mr-4">
              {streamBuffer}
              <span className="inline-block w-1 h-3 bg-zinc-400 ml-0.5 animate-pulse" />
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="px-4 py-3 border-t border-zinc-200">
          <form
            onSubmit={(e) => { e.preventDefault(); send() }}
            className="flex gap-2"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
              }}
              placeholder="What should I change?"
              rows={2}
              disabled={streaming || !sessionId}
              className="flex-1 text-sm resize-none border border-zinc-200 rounded-lg px-3 py-2 outline-none focus:border-zinc-400 disabled:opacity-40 transition-colors"
            />
            <button
              type="submit"
              disabled={!input.trim() || streaming || !sessionId}
              className="px-3 text-sm font-medium rounded-lg bg-zinc-900 text-white hover:bg-zinc-700 disabled:opacity-40 transition-colors self-end py-2"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { getAuthSession } from '../lib/session-fns'
import { cn } from '../lib/cn'

export const Route = createFileRoute('/agent')({ component: AgentPage })

type MessageRole = 'user' | 'agent' | 'tool' | 'system'

interface ChatMessage {
  id: string
  role: MessageRole
  text: string
  toolName?: string
}

function AgentPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [agentRunning, setAgentRunning] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const esRef = useRef<EventSource | null>(null)
  const currentAgentMsgRef = useRef<string | null>(null)

  useEffect(() => {
    async function init() {
      const session = await getAuthSession()
      if (!session?.user) {
        router.navigate({ to: '/' })
        return
      }
      // Ensure session exists
      await fetch('/api/agent/session')
      setReady(true)
    }
    init()
  }, [router])

  useEffect(() => {
    if (!ready) return

    const es = new EventSource('/api/agent/stream')
    esRef.current = es

    es.addEventListener('history', (e) => {
      const evt = JSON.parse(e.data)
      handleEvent(evt, true)
    })

    es.addEventListener('history_end', () => {
      // done replaying history
    })

    es.addEventListener('event', (e) => {
      const evt = JSON.parse(e.data)
      handleEvent(evt, false)
    })

    es.addEventListener('error', () => {
      // reconnect automatically (EventSource does this)
    })

    return () => {
      es.close()
    }
  }, [ready])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleEvent(evt: Record<string, unknown>, isHistory: boolean) {
    const type = evt.type as string

    if (type === 'session.status_running' || type === 'session.thread_status_running') {
      if (!isHistory) setAgentRunning(true)
    }

    if (type === 'session.status_idle' || type === 'session.thread_status_idle') {
      if (!isHistory) {
        setAgentRunning(false)
        currentAgentMsgRef.current = null
      }
    }

    if (type === 'user.message') {
      const content = (evt.content as Array<{ type: string; text?: string }>) ?? []
      const text = content.find((c) => c.type === 'text')?.text ?? ''
      if (text) {
        const id = `user-${(evt as Record<string, string>).id ?? Date.now()}`
        setMessages((prev) => {
          if (prev.some((m) => m.id === id)) return prev
          return [...prev, { id, role: 'user', text }]
        })
      }
    }

    if (type === 'agent.message') {
      const content = (evt.content as Array<{ type: string; text?: string }>) ?? []
      const text = content
        .filter((c) => c.type === 'text')
        .map((c) => c.text ?? '')
        .join('')
      if (text) {
        const id = `agent-${(evt as Record<string, string>).id ?? Date.now()}`
        setMessages((prev) => {
          if (prev.some((m) => m.id === id)) return prev
          return [...prev, { id, role: 'agent', text }]
        })
      }
    }

    if (type === 'agent.tool_use') {
      const name = (evt as Record<string, string>).name ?? 'tool'
      const id = `tool-${(evt as Record<string, string>).id ?? Date.now()}`
      setMessages((prev) => {
        if (prev.some((m) => m.id === id)) return prev
        return [...prev, { id, role: 'tool', text: '', toolName: name }]
      })
    }
  }

  async function sendMessage() {
    const text = input.trim()
    if (!text || sending) return
    setSending(true)
    setInput('')
    try {
      await fetch('/api/agent/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      setAgentRunning(true)
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-zinc-400">Starting agent…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50">
      {/* Header */}
      <div className="shrink-0 border-b border-zinc-200 bg-white px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => router.navigate({ to: '/dashboard' })}
          className="text-sm text-zinc-400 hover:text-zinc-900 transition-colors"
        >
          ← Dashboard
        </button>
        <div className="flex items-center gap-2 ml-auto">
          <div className={cn('w-2 h-2 rounded-full', agentRunning ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-300')} />
          <span className="text-sm text-zinc-500">{agentRunning ? 'Running…' : 'Idle'}</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4 max-w-3xl mx-auto w-full">
        {messages.length === 0 && (
          <div className="text-center text-zinc-400 text-sm mt-20">
            <p className="text-2xl mb-3">👋</p>
            <p>Your personal website builder.</p>
            <p className="mt-1 text-xs">Tell me what you want to build.</p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            {msg.role === 'tool' ? (
              <div className="flex items-center gap-2 text-xs text-zinc-400 bg-zinc-100 rounded-lg px-3 py-1.5">
                <span className="text-zinc-300">⚙</span>
                <span>{msg.toolName}</span>
              </div>
            ) : (
              <div
                className={cn(
                  'max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap',
                  msg.role === 'user'
                    ? 'bg-zinc-900 text-white rounded-br-sm'
                    : 'bg-white border border-zinc-200 text-zinc-900 rounded-bl-sm',
                )}
              >
                {msg.text}
              </div>
            )}
          </div>
        ))}

        {agentRunning && messages[messages.length - 1]?.role !== 'tool' && (
          <div className="flex justify-start">
            <div className="bg-white border border-zinc-200 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-zinc-200 bg-white px-4 py-3">
        <div className="max-w-3xl mx-auto flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message your agent…"
            rows={1}
            className="flex-1 resize-none px-3 py-2 text-sm rounded-xl border border-zinc-200 focus:border-zinc-400 outline-none transition-colors bg-zinc-50"
            style={{ maxHeight: 120, overflowY: 'auto' }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || sending}
            className="px-4 py-2 text-sm font-medium rounded-xl bg-zinc-900 text-white hover:bg-zinc-700 disabled:opacity-40 transition-colors self-end"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}

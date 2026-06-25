import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { getAuthSession } from '../lib/session-fns'
import { getTangledIdentity } from '../lib/session-fns'
import { cn } from '../lib/cn'
import { VetkaLogo } from '../components/VetkaLogo'

export const Route = createFileRoute('/agent')({ component: BuilderPage })

type MessageRole = 'user' | 'agent' | 'tool'

interface ChatMessage {
  id: string
  role: MessageRole
  text: string
  toolName?: string
}

function BuilderPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [siteUrl, setSiteUrl] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [agentRunning, setAgentRunning] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    async function init() {
      const session = await getAuthSession()
      if (!session?.user) {
        router.navigate({ to: '/' })
        return
      }
      const identity = await getTangledIdentity()
      if (identity?.selectedRepoKnot && identity?.handle) {
        setSiteUrl(`https://${identity.handle}.${identity.selectedRepoKnot}`)
      }
      await fetch('/api/agent/session')
      setReady(true)
    }
    init()
  }, [router])

  useEffect(() => {
    if (!ready) return
    const es = new EventSource('/api/agent/stream')
    esRef.current = es

    es.addEventListener('history', (e) => handleEvent(JSON.parse(e.data), true))
    es.addEventListener('event', (e) => handleEvent(JSON.parse(e.data), false))
    return () => es.close()
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
      if (!isHistory) setAgentRunning(false)
    }

    if (type === 'user.message') {
      const content = (evt.content as Array<{ type: string; text?: string }>) ?? []
      const text = content.find((c) => c.type === 'text')?.text ?? ''
      if (text) {
        const id = `user-${(evt as Record<string, string>).id ?? Date.now()}`
        setMessages((prev) => prev.some((m) => m.id === id) ? prev : [...prev, { id, role: 'user', text }])
      }
    }

    if (type === 'agent.message') {
      const content = (evt.content as Array<{ type: string; text?: string }>) ?? []
      const text = content.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('')
      if (text) {
        const id = `agent-${(evt as Record<string, string>).id ?? Date.now()}`
        setMessages((prev) => prev.some((m) => m.id === id) ? prev : [...prev, { id, role: 'agent', text }])
      }
    }

    if (type === 'agent.tool_use') {
      const name = (evt as Record<string, string>).name ?? 'tool'
      const id = `tool-${(evt as Record<string, string>).id ?? Date.now()}`
      setMessages((prev) => prev.some((m) => m.id === id) ? prev : [...prev, { id, role: 'tool', text: '', toolName: name }])
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
      <div className="h-screen flex items-center justify-center bg-white text-sm text-zinc-400">
        Starting…
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-white text-black text-sm">

      {/* Navbar */}
      <nav className="border-b border-black px-4 h-9 flex items-center shrink-0">
        <a href="/" className="flex items-center gap-1.5 text-zinc-500 hover:text-black underline underline-offset-2">
          <VetkaLogo size={14} />
          ← vetka
        </a>
        <span className="ml-4">Site builder</span>
        <div className="ml-auto flex items-center gap-2">
          <div className={cn('w-1.5 h-1.5', agentRunning ? 'bg-black' : 'bg-zinc-300')} />
          <span className="text-zinc-400">{agentRunning ? 'Running…' : 'Idle'}</span>
        </div>
      </nav>

      {/* Split: preview + chat */}
      <div className="flex flex-1 overflow-hidden">

        {/* Website preview */}
        <div className="flex-1 border-r border-black flex flex-col">
          <div className="border-b border-black px-4 h-8 flex items-center text-xs text-zinc-500 shrink-0">
            {siteUrl ? (
              <a href={siteUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                {siteUrl}
              </a>
            ) : (
              <span>Preview</span>
            )}
          </div>
          {siteUrl ? (
            <iframe
              src={siteUrl}
              className="flex-1 w-full border-0"
              title="Site preview"
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-zinc-400 flex-col gap-2">
              <div>No site yet</div>
              <div className="text-xs">Tell the agent what to build →</div>
            </div>
          )}
        </div>

        {/* Chat panel */}
        <div className="w-80 flex flex-col shrink-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-zinc-400 text-xs pt-4">
                Tell me what to build. I can create and edit your site.
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id}>
                {msg.role === 'tool' ? (
                  <div className="text-xs text-zinc-400 border border-zinc-200 px-2 py-1">
                    ⚙ {msg.toolName}
                  </div>
                ) : (
                  <div className={cn(
                    msg.role === 'user' ? 'ml-4 text-right' : 'mr-4'
                  )}>
                    <div className={cn(
                      'inline-block px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed',
                      msg.role === 'user'
                        ? 'bg-black text-white'
                        : 'border border-black bg-white'
                    )}>
                      {msg.text}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {agentRunning && (
              <div className="mr-4">
                <div className="inline-block border border-black px-3 py-2">
                  <span className="text-zinc-400 text-xs">…</span>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-black p-3 shrink-0">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message…"
              rows={3}
              className="w-full resize-none border border-black px-2 py-1.5 text-sm outline-none block"
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || sending}
              className="mt-2 w-full py-1.5 bg-black text-white text-sm disabled:opacity-40 hover:opacity-80"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

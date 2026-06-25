import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { getAuthSession } from '../../../lib/session-fns'

export const Route = createFileRoute('/sites/$domain/builder')({
  beforeLoad: async () => {
    const session = await getAuthSession()
    if (!session?.user) throw redirect({ to: '/' })
  },
  component: BuilderPage,
})

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TextPart = { type: 'text'; text: string }
type ImagePart = { type: 'image'; file_id: string; previewUrl?: string }
type ToolPart = {
  type: 'tool'
  id: string
  name: string
  input: unknown
  state: 'running' | 'done' | 'error'
  output?: string
}
type Part = TextPart | ImagePart | ToolPart

type Attachment = { file_id: string; mime_type: string; name: string; previewUrl?: string }

type UserMessage = { role: 'user'; text: string; images?: ImagePart[] }
type AssistantMessage = { role: 'assistant'; parts: Part[] }
type ChatMessage = UserMessage | AssistantMessage

type StreamEvent =
  | { type: 'thinking' }
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; output: string; is_error?: boolean }
  | { done: true }
  | { error: string }

// ---------------------------------------------------------------------------
// Markdown renderer
// ---------------------------------------------------------------------------

const MD_COMPONENTS = {
  pre({ children }: { children?: React.ReactNode }) {
    return (
      <div className="my-2 border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-xs font-mono leading-relaxed overflow-x-auto">
        <pre className="whitespace-pre">{children}</pre>
      </div>
    )
  },
  code({ children, className }: { children?: React.ReactNode; className?: string }) {
    if (!className) {
      return <code className="bg-zinc-100 px-1 rounded text-xs font-mono">{children}</code>
    }
    return <code className={className}>{children}</code>
  },
  p({ children }: { children?: React.ReactNode }) {
    return <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
  },
  ul({ children }: { children?: React.ReactNode }) {
    return <ul className="mb-2 ml-4 list-disc space-y-0.5">{children}</ul>
  },
  ol({ children }: { children?: React.ReactNode }) {
    return <ol className="mb-2 ml-4 list-decimal space-y-0.5">{children}</ol>
  },
  h1({ children }: { children?: React.ReactNode }) {
    return <h1 className="font-semibold text-base mb-1 mt-3 first:mt-0">{children}</h1>
  },
  h2({ children }: { children?: React.ReactNode }) {
    return <h2 className="font-semibold text-sm mb-1 mt-3 first:mt-0">{children}</h2>
  },
  h3({ children }: { children?: React.ReactNode }) {
    return <h3 className="font-medium text-sm mb-1 mt-2 first:mt-0">{children}</h3>
  },
}

function Markdown({ content }: { content: string }) {
  return (
    <div className="text-sm text-zinc-800">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS as any}>
        {content}
      </ReactMarkdown>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tool card
// ---------------------------------------------------------------------------


function ToolCard({ part, isLast }: { part: ToolPart; isLast: boolean }) {
  const [open, setOpen] = useState(false)
  const hasOutput = !!part.output

  const inputBrief = (() => {
    try {
      const inp = part.input as Record<string, unknown>
      const first = Object.values(inp)[0]
      if (typeof first === 'string') return first.slice(0, 60) + (first.length > 60 ? '…' : '')
    } catch {}
    return ''
  })()

  return (
    <div className="relative flex gap-2.5">
      {/* Rail */}
      <div className="relative w-3 shrink-0">
        {!isLast && (
          <span className="absolute top-[14px] bottom-0 left-1/2 w-px -translate-x-1/2 bg-zinc-200" />
        )}
        {part.state === 'running' ? (
          <span className="absolute top-[14px] left-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
            <span className="inline-block size-2 rounded-full bg-zinc-400 animate-pulse" />
          </span>
        ) : (
          <span
            className={`absolute top-[14px] left-1/2 z-10 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white ${
              part.state === 'error' ? 'bg-red-400' : 'bg-zinc-300'
            }`}
          />
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 pb-2">
        <button
          type="button"
          onClick={() => hasOutput && setOpen((o) => !o)}
          className={`flex w-full items-center gap-1.5 py-1 text-left select-none ${hasOutput ? 'cursor-pointer' : 'cursor-default'}`}
        >
          <span className="text-xs font-mono font-medium text-zinc-600 shrink-0">{part.name}</span>
          {inputBrief && (
            <span className="text-xs text-zinc-400 truncate min-w-0">{inputBrief}</span>
          )}
          {part.state === 'running' && (
            <span className="text-xs text-zinc-400 ml-auto shrink-0">running…</span>
          )}
          {hasOutput && (
            <span className={`ml-auto text-zinc-400 text-xs shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
          )}
        </button>

        {open && part.output && (
          <div className="mt-1 border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-mono text-zinc-700 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap">
            {part.output}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Message renderer — renders parts in event order, groups consecutive tools
// ---------------------------------------------------------------------------

function MessageBubble({ msg }: { msg: ChatMessage }) {
  if (msg.role === 'user') {
    return (
      <div className="flex flex-col items-end gap-1.5">
        {msg.images?.map((img, i) => (
          img.previewUrl
            ? <img key={i} src={img.previewUrl} alt="" className="max-w-[85%] max-h-48 border border-zinc-700 object-contain" />
            : null
        ))}
        {msg.text && (
          <div className="bg-black text-white text-sm px-3 py-2 max-w-[85%] whitespace-pre-wrap">
            {msg.text}
          </div>
        )}
      </div>
    )
  }

  // Walk parts in order; batch consecutive tool parts so the rail connects them
  const nodes: React.ReactNode[] = []
  let i = 0
  while (i < msg.parts.length) {
    const part = msg.parts[i]
    if (part.type === 'tool') {
      const group: ToolPart[] = [part]
      while (i + 1 < msg.parts.length && msg.parts[i + 1].type === 'tool') {
        i++
        group.push(msg.parts[i] as ToolPart)
      }
      nodes.push(
        <div key={`tools-${i}`} className="pl-1">
          {group.map((t, j) => (
            <ToolCard key={t.id || j} part={t} isLast={j === group.length - 1} />
          ))}
        </div>
      )
    } else {
      nodes.push(<Markdown key={i} content={part.text} />)
    }
    i++
  }

  return <div className="space-y-2">{nodes}</div>
}

// ---------------------------------------------------------------------------
// Streaming indicator
// ---------------------------------------------------------------------------

function StreamingIndicator({ thinking }: { thinking: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 rounded-full bg-zinc-300 animate-pulse"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
      {thinking && (
        <span className="ml-1 text-xs text-zinc-400">Thinking…</span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Builder page
// ---------------------------------------------------------------------------

function BuilderPage() {
  const { domain } = Route.useParams()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`/api/agent/session?domain=${encodeURIComponent(domain)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.sessionId) setSessionId(data.sessionId)
        if (data?.history?.length) setMessages(data.history)
      })
  }, [domain])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function uploadFile(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/agent/upload', { method: 'POST', body: fd })
      if (!res.ok) return
      const data = await res.json() as { file_id: string; mime_type: string; name: string }
      const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined
      setAttachments((prev) => [...prev, { ...data, previewUrl }])
    } finally {
      setUploading(false)
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData.items)
    const imageItem = items.find((item) => item.type.startsWith('image/'))
    if (!imageItem) return
    e.preventDefault()
    const file = imageItem.getAsFile()
    if (file) uploadFile(new File([file], 'pasted-image.png', { type: file.type }))
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
    e.target.value = ''
  }

  function removeAttachment(file_id: string) {
    setAttachments((prev) => {
      const att = prev.find((a) => a.file_id === file_id)
      if (att?.previewUrl) URL.revokeObjectURL(att.previewUrl)
      return prev.filter((a) => a.file_id !== file_id)
    })
  }

  async function send() {
    const text = input.trim()
    if ((!text && !attachments.length) || !sessionId || streaming) return
    setInput('')
    const pendingAttachments = attachments
    setAttachments([])
    setThinking(true)

    const images = pendingAttachments
      .filter((a) => a.mime_type.startsWith('image/'))
      .map((a) => ({ type: 'image' as const, file_id: a.file_id, previewUrl: a.previewUrl }))
    const userMsg: UserMessage = { role: 'user', text, images: images.length ? images : undefined }
    const assistantMsg: AssistantMessage = { role: 'assistant', parts: [] }
    setMessages((m) => [...m, userMsg, assistantMsg])
    setStreaming(true)

    try {
      const res = await fetch('/api/agent/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: text,
          attachments: pendingAttachments.map(({ file_id, mime_type, name }) => ({ file_id, mime_type, name })),
        }),
      })
      if (!res.ok || !res.body) throw new Error('Stream failed')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue
          try {
            const evt = JSON.parse(line.slice(6)) as StreamEvent
            if ('done' in evt) break
            if ('error' in evt) {
              setMessages((prev) => {
                const next = [...prev]
                const last = next[next.length - 1] as AssistantMessage
                return [...next.slice(0, -1), { ...last, parts: [...last.parts, { type: 'text', text: `Error: ${evt.error}` }] }]
              })
              break
            }
            if (evt.type === 'thinking') {
              // keep thinking=true (already set), nothing more to do
            } else if (evt.type === 'text') {
              setThinking(false)
              setMessages((prev) => {
                const next = [...prev]
                const last = { ...(next[next.length - 1] as AssistantMessage) }
                const parts = [...last.parts]
                const lastPart = parts[parts.length - 1]
                if (lastPart?.type === 'text') {
                  parts[parts.length - 1] = { type: 'text', text: lastPart.text + evt.text }
                } else {
                  parts.push({ type: 'text', text: evt.text })
                }
                return [...next.slice(0, -1), { ...last, parts }]
              })
            } else if (evt.type === 'tool_use') {
              setThinking(false)
              setMessages((prev) => {
                const next = [...prev]
                const last = { ...(next[next.length - 1] as AssistantMessage) }
                return [...next.slice(0, -1), {
                  ...last,
                  parts: [...last.parts, { type: 'tool', id: evt.id, name: evt.name, input: evt.input, state: 'running' as const }],
                }]
              })
            } else if (evt.type === 'tool_result') {
              setMessages((prev) => {
                const next = [...prev]
                const last = { ...(next[next.length - 1] as AssistantMessage) }
                const parts = last.parts.map((p): Part =>
                  p.type === 'tool' && p.id === evt.tool_use_id
                    ? { ...p, state: evt.is_error ? 'error' : 'done', output: evt.output }
                    : p
                )
                return [...next.slice(0, -1), { ...last, parts }]
              })
            }
          } catch {}
        }
      }
    } catch {
      setMessages((prev) => {
        const last = prev[prev.length - 1] as AssistantMessage
        return [...prev.slice(0, -1), { ...last, parts: [...last.parts, { type: 'text', text: '(Error — please try again)' }] }]
      })
    } finally {
      setStreaming(false)
      setThinking(false)
    }
  }

  const siteUrl = domain.includes('.') ? `https://${domain}` : null

  return (
    <div className="h-screen flex overflow-hidden bg-white">
      {/* Left: site preview */}
      <div className="flex-1 border-r border-zinc-200 flex flex-col min-w-0">
        <div className="px-4 py-2 border-b border-zinc-200 flex items-center gap-2 shrink-0">
          <span className="text-xs text-zinc-500 truncate">{domain}</span>
          {siteUrl && (
            <a href={siteUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-zinc-400 hover:text-zinc-700 ml-auto shrink-0">
              Open ↗
            </a>
          )}
        </div>
        {siteUrl ? (
          <iframe src={siteUrl} className="flex-1 w-full border-0" title={domain} sandbox="allow-scripts allow-same-origin allow-forms" />
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-zinc-400">No preview</div>
        )}
      </div>

      {/* Right: chat */}
      <div className="w-[480px] shrink-0 flex flex-col border-l border-zinc-200">
        <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between shrink-0">
          <span className="text-sm font-medium">Builder</span>
          <a href="/sites" className="text-xs text-zinc-400 hover:text-zinc-700">← Sites</a>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && !streaming && (
            <p className="text-xs text-zinc-400">Tell me what you'd like to do with your site.</p>
          )}
          {messages.map((msg, i) => (
            <MessageBubble key={i} msg={msg} />
          ))}
          {streaming && <StreamingIndicator thinking={thinking} />}
          <div ref={bottomRef} />
        </div>

        <div className="px-4 py-3 border-t border-zinc-200 shrink-0">
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {attachments.map((att) => (
                <div key={att.file_id} className="relative group">
                  {att.previewUrl ? (
                    <img src={att.previewUrl} alt={att.name} className="h-14 w-14 object-cover border border-zinc-200" />
                  ) : (
                    <div className="h-14 w-14 flex items-center justify-center border border-zinc-200 bg-zinc-50 text-xs text-zinc-500 font-mono text-center px-1 leading-tight">
                      {att.name.split('.').pop()?.toUpperCase()}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeAttachment(att.file_id)}
                    className="absolute -top-1 -right-1 size-4 bg-zinc-800 text-white text-xs rounded-full hidden group-hover:flex items-center justify-center leading-none"
                  >
                    ×
                  </button>
                </div>
              ))}
              {uploading && (
                <div className="h-14 w-14 flex items-center justify-center border border-zinc-200 bg-zinc-50">
                  <span className="size-3 rounded-full bg-zinc-300 animate-pulse" />
                </div>
              )}
            </div>
          )}
          <form onSubmit={(e) => { e.preventDefault(); send() }} className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf,text/plain"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={streaming || !sessionId || uploading}
              title="Attach file"
              className="self-end py-2 px-2 text-zinc-400 hover:text-zinc-700 disabled:opacity-40 transition-colors shrink-0"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M13.5 8.5l-5.5 5.5a4 4 0 01-5.657-5.657l6-6a2.5 2.5 0 013.535 3.535l-6.006 6.007a1 1 0 01-1.414-1.414l5.5-5.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              onPaste={handlePaste}
              placeholder="What should I change? Paste images with Ctrl+V"
              rows={2}
              disabled={streaming || !sessionId}
              className="flex-1 text-sm resize-none border border-zinc-200 px-3 py-2 outline-none focus:border-zinc-400 disabled:opacity-40 transition-colors"
            />
            <button
              type="submit"
              disabled={(!input.trim() && !attachments.length) || streaming || !sessionId}
              className="px-3 text-sm font-medium bg-black text-white hover:bg-zinc-800 disabled:opacity-40 transition-colors self-end py-2"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

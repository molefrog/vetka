import { useEffect, useState } from 'react'
import { Avatar } from './Avatar'
import {
  PANEL,
  panelContainerStyle,
  HeaderBtn,
  PanelRow,
  svg,
  IconClose,
  IconExpand,
  IconBack,
} from './panel-kit'
import {
  loadConversations,
  loadThread,
  sendMessage,
  unreadCount,
  type Conversation,
  type ChatMessage,
} from './messages-data'
import type { NotchMode } from './Widget'

// A peer carries an `id` (site id) when it's messageable via the API; the
// host-page owner fallback may lack one until owner detection resolves a site.
type Peer = { id?: string | null; name: string; seed: string; src?: string }

interface Props {
  mode: NotchMode
  owner: Peer
  apiBase: string
  onClose: () => void
}

// --- message-specific inline icons (1.6 stroke, round) --------------------
const IconCompose = () =>
  svg(
    <>
      <path d="M5 19 h14" />
      <path d="M14.5 5.5 l4 4 -9 9 -4.5 1 1-4.5 z" />
    </>,
  )
const IconSend = () => svg(<><path d="M5 12 H18" /><path d="M12 6 L18 12 L12 18" /></>)

export function MessagesPanel({ mode, owner, apiBase, onClose }: Props) {
  const [view, setView] = useState<'list' | 'thread'>('list')
  const [peer, setPeer] = useState<Peer | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')

  // Load the conversation list on open.
  useEffect(() => {
    let alive = true
    loadConversations(apiBase).then((c) => {
      if (alive) setConversations(c)
    })
    return () => {
      alive = false
    }
  }, [apiBase])

  const openConversation = async (c: Conversation) => {
    setPeer({ id: c.id, name: c.name, seed: c.seed, src: c.image ?? undefined })
    setMessages([])
    setView('thread')
    const thread = await loadThread(apiBase, c.id)
    setMessages(thread)
    // Opening clears the unread dot (the server marked it read).
    setConversations((list) =>
      list.map((x) => (x.id === c.id ? { ...x, unread: false } : x)),
    )
  }
  const openOwner = async () => {
    setPeer(owner)
    setMessages([])
    setView('thread')
    if (owner.id) setMessages(await loadThread(apiBase, owner.id))
  }
  const send = async () => {
    const text = input.trim()
    if (!text || !peer?.id) return
    setInput('')
    const optimistic: ChatMessage = { id: `tmp-${text.length}-${text}`, fromMe: true, text }
    setMessages((m) => [...m, optimistic])
    const saved = await sendMessage(apiBase, peer.id, text)
    if (saved) setMessages((m) => m.map((x) => (x.id === optimistic.id ? saved : x)))
  }

  const badge = unreadCount(conversations)

  return (
    <div style={panelContainerStyle} onMouseDown={(e) => e.stopPropagation()}>
      {view === 'list' ? (
        <>
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '14px 14px 12px 18px',
              borderBottom: `1px solid ${PANEL.divider}`,
            }}
          >
            <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.01em' }}>
              Messages
            </span>
            {badge > 0 && (
              <span
                style={{
                  minWidth: 22,
                  height: 22,
                  padding: '0 6px',
                  borderRadius: 999,
                  background: PANEL.badge,
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {badge}
              </span>
            )}
            <div style={{ flex: 1 }} />
            <HeaderBtn title="Expand">
              <IconExpand />
            </HeaderBtn>
            <HeaderBtn onClick={onClose} title="Close">
              <IconClose />
            </HeaderBtn>
          </div>

          {/* Scrollable list */}
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '6px 0' }}>
            {mode === 'visitor' && (
              <>
                <div
                  style={{
                    padding: '8px 18px 4px',
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: '.08em',
                    textTransform: 'uppercase',
                    color: PANEL.muted,
                  }}
                >
                  Suggested
                </div>
                <PanelRow
                  name={owner.name}
                  seed={owner.seed}
                  src={owner.src}
                  subtitle="Start a conversation"
                  subtitleColor={PANEL.accentText}
                  onClick={openOwner}
                />
                <div
                  style={{ height: 1, background: PANEL.divider, margin: '6px 18px' }}
                />
              </>
            )}

            {conversations.map((c) => {
              const time = c.status ? '' : c.time
              return (
                <PanelRow
                  key={c.id}
                  name={c.name}
                  seed={c.seed}
                  src={c.image ?? undefined}
                  strong={c.unread}
                  subtitleColor={c.unread ? PANEL.ink : PANEL.muted}
                  subtitle={
                    <>
                      {c.status ?? c.preview}
                      {time ? (
                        <span style={{ color: PANEL.muted, fontWeight: 400 }}> · {time}</span>
                      ) : null}
                    </>
                  }
                  trailing={
                    c.unread ? (
                      <span
                        style={{
                          width: 9,
                          height: 9,
                          borderRadius: 999,
                          background: PANEL.unread,
                          display: 'block',
                        }}
                      />
                    ) : null
                  }
                  onClick={() => openConversation(c)}
                />
              )
            })}
          </div>

          {/* Compose FAB */}
          <ComposeFab onClick={mode === 'visitor' ? openOwner : undefined} />
        </>
      ) : (
        <Thread
          peer={peer!}
          messages={messages}
          input={input}
          setInput={setInput}
          onSend={send}
          onBack={() => setView('list')}
          onClose={onClose}
        />
      )}
    </div>
  )
}

function ComposeFab({ onClick }: { onClick?: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      title="New message"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'absolute',
        right: 16,
        bottom: 16,
        width: 50,
        height: 50,
        borderRadius: 999,
        border: PANEL.border,
        cursor: 'pointer',
        color: PANEL.ink,
        background: hover ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.10)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 6px 18px rgba(0,0,0,.3)',
        transition: 'background .15s ease',
      }}
    >
      <IconCompose />
    </button>
  )
}

// --- thread (single conversation) -----------------------------------------
function Thread({
  peer,
  messages,
  input,
  setInput,
  onSend,
  onBack,
  onClose,
}: {
  peer: Peer
  messages: ChatMessage[]
  input: string
  setInput: (v: string) => void
  onSend: () => void
  onBack: () => void
  onClose: () => void
}) {
  return (
    <>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 14px',
          borderBottom: `1px solid ${PANEL.divider}`,
        }}
      >
        <HeaderBtn onClick={onBack} title="Back">
          <IconBack />
        </HeaderBtn>
        <Avatar src={peer.src} seed={peer.seed} size={32} />
        <span style={{ fontSize: 15, fontWeight: 700, flex: 1, minWidth: 0 }}>
          {peer.name}
        </span>
        <HeaderBtn onClick={onClose} title="Close">
          <IconClose />
        </HeaderBtn>
      </div>

      {/* Bubbles — recessed darker canvas so the conversation reads as its own
          surface within the frost shell. */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '14px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          background: PANEL.chatBg,
        }}
      >
        {messages.length === 0 ? (
          <div
            style={{
              margin: 'auto',
              textAlign: 'center',
              color: PANEL.muted,
              fontSize: 13.5,
              padding: 24,
            }}
          >
            Say hi to {peer.name} 👋
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              style={{
                alignSelf: m.fromMe ? 'flex-end' : 'flex-start',
                maxWidth: '76%',
                padding: '8px 12px',
                borderRadius: 16,
                fontSize: 14,
                lineHeight: 1.35,
                background: m.fromMe ? PANEL.accent : PANEL.bubbleIn,
                color: m.fromMe ? PANEL.onAccent : PANEL.ink,
                borderBottomRightRadius: m.fromMe ? 5 : 16,
                borderBottomLeftRadius: m.fromMe ? 16 : 5,
              }}
            >
              {m.text}
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: 12,
          borderTop: `1px solid ${PANEL.divider}`,
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSend()
          }}
          placeholder="Message…"
          style={{
            flex: 1,
            minWidth: 0,
            height: 40,
            padding: '0 14px',
            borderRadius: 999,
            border: PANEL.border,
            background: 'rgba(255,255,255,.06)',
            color: PANEL.ink,
            fontSize: 14,
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={onSend}
          title="Send"
          style={{
            width: 40,
            height: 40,
            borderRadius: 999,
            border: 'none',
            cursor: input.trim() ? 'pointer' : 'default',
            color: PANEL.onAccent,
            background: input.trim() ? PANEL.accent : 'rgba(255,255,255,.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: '0 0 auto',
            transition: 'background .15s ease',
          }}
        >
          <IconSend />
        </button>
      </div>
    </>
  )
}

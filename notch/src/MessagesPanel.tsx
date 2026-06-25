import { useState, type CSSProperties } from 'react'
import { Avatar } from './Avatar'
import { CONVERSATIONS, unreadCount, type Conversation, type MockMessage } from './messages-data'
import type { NotchMode } from './Widget'

const PANEL = {
  surface: 'rgba(18,18,24,.92)',
  border: '1px solid rgba(255,255,255,.12)',
  shadow: '0 16px 48px rgba(0,0,0,.45)',
  blur: 'blur(20px) saturate(160%)',
  ink: '#ffffff',
  muted: 'rgba(255,255,255,.5)',
  rowHover: 'rgba(255,255,255,.06)',
  divider: 'rgba(255,255,255,.08)',
  accent: 'oklch(0.7 0.085 152)',
  onAccent: '#0c1f14',
  unread: '#3b82f6',
  badge: '#ef4444',
  bubbleIn: 'rgba(255,255,255,.08)',
}

type Peer = { name: string; seed: string; src?: string }

interface Props {
  mode: NotchMode
  owner: Peer
  onClose: () => void
}

// --- tiny inline icons (1.6 stroke, round), panel-local -------------------
const svg = (children: React.ReactNode): React.ReactNode => (
  <svg
    viewBox="0 0 24 24"
    width={20}
    height={20}
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ display: 'block' }}
  >
    {children}
  </svg>
)
const IconClose = () => svg(<><path d="M6 6 L18 18" /><path d="M18 6 L6 18" /></>)
const IconExpand = () =>
  svg(
    <>
      <path d="M9 4 H4 V9" />
      <path d="M15 4 H20 V9" />
      <path d="M9 20 H4 V15" />
      <path d="M15 20 H20 V15" />
    </>,
  )
const IconBack = () => svg(<path d="M15 5 L8 12 L15 19" />)
const IconCompose = () =>
  svg(
    <>
      <path d="M5 19 h14" />
      <path d="M14.5 5.5 l4 4 -9 9 -4.5 1 1-4.5 z" />
    </>,
  )
const IconSend = () => svg(<><path d="M5 12 H18" /><path d="M12 6 L18 12 L12 18" /></>)

// --- header icon button ----------------------------------------------------
function HeaderBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode
  onClick?: () => void
  title?: string
}) {
  const [hover, setHover] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 34,
        height: 34,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 9,
        border: 'none',
        cursor: 'pointer',
        color: PANEL.ink,
        background: hover ? PANEL.rowHover : 'transparent',
        transition: 'background .15s ease',
        flex: '0 0 auto',
      }}
    >
      {children}
    </button>
  )
}

const containerStyle: CSSProperties = {
  position: 'absolute',
  bottom: 'calc(100% + 12px)',
  right: 0,
  width: 380,
  maxHeight: 'min(560px, 70vh)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  borderRadius: 18,
  background: PANEL.surface,
  border: PANEL.border,
  boxShadow: PANEL.shadow,
  backdropFilter: PANEL.blur,
  WebkitBackdropFilter: PANEL.blur,
  color: PANEL.ink,
  fontFamily: "'Manrope', system-ui, -apple-system, sans-serif",
  animation: 'notch-panel-in .16s ease-out',
  transformOrigin: 'bottom right',
  zIndex: 10,
}

export function MessagesPanel({ mode, owner, onClose }: Props) {
  const [view, setView] = useState<'list' | 'thread'>('list')
  const [peer, setPeer] = useState<Peer | null>(null)
  const [messages, setMessages] = useState<MockMessage[]>([])
  const [input, setInput] = useState('')

  const openConversation = (c: Conversation) => {
    setPeer({ name: c.name, seed: c.seed })
    setMessages(c.thread)
    setView('thread')
  }
  const openOwner = () => {
    setPeer(owner)
    setMessages([])
    setView('thread')
  }
  const send = () => {
    const text = input.trim()
    if (!text) return
    setMessages((m) => [...m, { id: `me-${m.length}-${text.length}-${Math.random()}`, fromMe: true, text }])
    setInput('')
  }

  const badge = unreadCount(CONVERSATIONS)

  return (
    <div style={containerStyle} onMouseDown={(e) => e.stopPropagation()}>
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
                <Row
                  name={owner.name}
                  seed={owner.seed}
                  src={owner.src}
                  preview="Start a conversation"
                  highlight
                  onClick={openOwner}
                />
                <div
                  style={{ height: 1, background: PANEL.divider, margin: '6px 18px' }}
                />
              </>
            )}

            {CONVERSATIONS.map((c) => (
              <Row
                key={c.id}
                name={c.name}
                seed={c.seed}
                preview={c.status ?? c.preview}
                time={c.status ? '' : c.time}
                unread={c.unread}
                onClick={() => openConversation(c)}
              />
            ))}
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

// --- a single conversation row --------------------------------------------
function Row({
  name,
  seed,
  src,
  preview,
  time,
  unread,
  highlight,
  onClick,
}: {
  name: string
  seed: string
  src?: string
  preview: string
  time?: string
  unread?: boolean
  highlight?: boolean
  onClick?: () => void
}) {
  const [hover, setHover] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 18px',
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        background: hover ? PANEL.rowHover : 'transparent',
        transition: 'background .12s ease',
        color: PANEL.ink,
      }}
    >
      <Avatar src={src} seed={seed} size={52} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 15,
            fontWeight: unread ? 700 : 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {name}
        </div>
        <div
          style={{
            fontSize: 13.5,
            marginTop: 2,
            color: highlight ? PANEL.accent : unread ? PANEL.ink : PANEL.muted,
            fontWeight: unread ? 600 : 400,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {preview}
          {time ? <span style={{ color: PANEL.muted, fontWeight: 400 }}> · {time}</span> : null}
        </div>
      </div>
      {unread && (
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: 999,
            background: PANEL.unread,
            flex: '0 0 auto',
          }}
        />
      )}
    </button>
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
  messages: MockMessage[]
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

      {/* Bubbles */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '14px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
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

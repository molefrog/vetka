import { useState, type CSSProperties, type ReactNode } from 'react'
import { Avatar } from './Avatar'

// Shared design system for the notch popup panels (Messages, Follows, …).
// Both panels import from here so they stay visually consistent and can be
// tweaked in one place.

// Frost dark-glass — the exact material as the notch bar (see FROST in Widget.tsx
// and "Frost — dark glass" in local-drafts/README.md). The panel shell shares the
// bar's translucent surface so the two read as one piece of glass; legibility for
// dense text is handled locally by deepening the chat canvas (chatBg), not by
// darkening the whole shell.
export const PANEL = {
  surface: 'rgba(20,20,26,.42)',
  border: '1px solid rgba(255,255,255,.16)',
  // Drop shadow grounds the floating glass; the inset top line is the bright
  // rim highlight that reads as a glass edge catching light.
  shadow: '0 16px 40px rgba(0,0,0,.36), inset 0 1px 0 rgba(255,255,255,.14)',
  blur: 'blur(16px) saturate(170%)',
  ink: '#ffffff',
  muted: 'rgba(255,255,255,.5)',
  rowHover: 'rgba(255,255,255,.08)',
  // Small header buttons mirror the bar's button highlight exactly (.14); large
  // full-width rows use a gentler wash so they don't glare.
  btnHover: 'rgba(255,255,255,.14)',
  divider: 'rgba(255,255,255,.08)',
  // A darker recessed canvas behind the message bubbles. The frost shell stays
  // light; this inner layer deepens just the chat so incoming bubbles and text
  // hold contrast over a busy host page.
  chatBg: 'rgba(8,8,12,.32)',
  accent: 'oklch(0.7 0.085 152)',
  // Brighter, higher-chroma green for accent *text* — the muted `accent` is for
  // fills (bubbles, Follow button) where dark `onAccent` sits on top; as text on
  // the frost it washes out, so call-to-action labels use this instead.
  accentText: 'oklch(0.86 0.15 158)',
  onAccent: '#0c1f14',
  unread: '#3b82f6',
  badge: '#ef4444',
  bubbleIn: 'rgba(255,255,255,.10)',
}

export const panelContainerStyle: CSSProperties = {
  position: 'absolute',
  bottom: 'calc(100% + 12px)',
  right: 0,
  width: 380,
  maxHeight: 'min(560px, 70vh)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  borderRadius: 22,
  background: PANEL.surface,
  border: PANEL.border,
  boxShadow: PANEL.shadow,
  backdropFilter: PANEL.blur,
  WebkitBackdropFilter: PANEL.blur,
  color: PANEL.ink,
  fontFamily: "'Overused Grotesk', system-ui, -apple-system, sans-serif",
  animation: 'notch-panel-in .16s ease-out',
  transformOrigin: 'bottom right',
  zIndex: 10,
}

// --- shared inline icons (1.6 stroke, round) -------------------------------
export const svg = (children: ReactNode): ReactNode => (
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
export const IconClose = () => svg(<><path d="M6 6 L18 18" /><path d="M18 6 L6 18" /></>)
export const IconExpand = () =>
  svg(
    <>
      <path d="M9 4 H4 V9" />
      <path d="M15 4 H20 V9" />
      <path d="M9 20 H4 V15" />
      <path d="M15 20 H20 V15" />
    </>,
  )
export const IconBack = () => svg(<path d="M15 5 L8 12 L15 19" />)

// --- header icon button ----------------------------------------------------
export function HeaderBtn({
  children,
  onClick,
  title,
}: {
  children: ReactNode
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
        background: hover ? PANEL.btnHover : 'transparent',
        transition: 'background .15s ease',
        flex: '0 0 auto',
      }}
    >
      {children}
    </button>
  )
}

// --- a single list row (avatar + title + subtitle + optional trailing) -----
// Generic across panels: Messages passes an unread dot as `trailing`, Follows
// passes a Follow/Following button.
export function PanelRow({
  name,
  seed,
  src,
  subtitle,
  subtitleColor,
  strong,
  trailing,
  onClick,
}: {
  name: string
  seed: string
  src?: string
  subtitle: ReactNode
  subtitleColor?: string
  strong?: boolean
  trailing?: ReactNode
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
        cursor: onClick ? 'pointer' : 'default',
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
            fontWeight: strong ? 700 : 600,
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
            color: subtitleColor ?? PANEL.muted,
            fontWeight: strong ? 600 : 400,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {subtitle}
        </div>
      </div>
      {trailing != null && <div style={{ flex: '0 0 auto' }}>{trailing}</div>}
    </button>
  )
}

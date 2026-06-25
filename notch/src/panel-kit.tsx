import { useState, type CSSProperties, type ReactNode } from 'react'
import { Avatar } from './Avatar'

// Shared design system for the notch popup panels (Messages, Follows, …).
// Both panels import from here so they stay visually consistent and can be
// tweaked in one place.

export const PANEL = {
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

export const panelContainerStyle: CSSProperties = {
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
        background: hover ? PANEL.rowHover : 'transparent',
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

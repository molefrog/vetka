import { useState, useEffect, useRef, type CSSProperties } from 'react'
import { NotchIcon, type IconName } from './NotchIcon'
import { VetkaMark } from './VetkaMark'
import { Avatar } from './Avatar'
import { MessagesPanel } from './MessagesPanel'

// Frost — dark glass (the recommended universal default, per local-drafts/README.md).
const FROST = {
  surface: 'rgba(20,20,26,.42)',
  ink: '#ffffff',
  logo: '#ffffff',
  border: '1px solid rgba(255,255,255,.16)',
  shadow: '0 10px 30px rgba(0,0,0,.24)',
  blur: 'blur(16px) saturate(170%)',
  hoverBg: 'rgba(255,255,255,.14)',
  tipBg: 'rgba(10,10,14,.82)',
  tipInk: '#ffffff',
  tipChipBg: 'rgba(255,255,255,.18)',
  avatarBg: 'rgba(255,255,255,.12)',
}

// The viewer's relationship to the page the notch is embedded on.
//   anonymous — logged out
//   owner     — logged in, viewing their own site
//   visitor   — logged in, viewing someone else's site
export type NotchMode = 'anonymous' | 'owner' | 'visitor'

interface User {
  name: string
  email: string
  image?: string | null
}

interface Props {
  apiBase: string
  // Dev override to preview a specific state (?notch=owner etc). When unset the
  // mode is derived from auth (owner detection needs the server — see /me).
  forceMode?: NotchMode | null
}

// A trailing slot is either an icon button or the avatar (signed-in account).
type Slot =
  | { id: string; kind: 'icon'; key: IconName; label: string; sc: string | null }
  | { id: string; kind: 'avatar'; label: string }

const i = (key: IconName, label: string, sc: string | null = null): Slot => ({
  id: key,
  kind: 'icon',
  key,
  label,
  sc,
})
const avatar = (): Slot => ({ id: 'avatar', kind: 'avatar', label: 'Account' })

const MODES: Record<NotchMode, Slot[]> = {
  // 1. Not logged in: log in + who this site's owner follows.
  anonymous: [i('login', 'Log in'), i('follows', 'Following')],
  // 2. Logged in, own site: feed, messages, reactions overlay, avatar.
  owner: [
    i('feed', 'Updates', 'U'),
    i('messages', 'Messages', 'M'),
    i('reactions', 'Reactions'),
    avatar(),
  ],
  // 3. Logged in, someone else's site: follow, react, reactions, feed, messages, avatar.
  visitor: [
    i('follow', 'Follow'),
    i('react', 'React'),
    i('reactions', 'Reactions'),
    i('feed', 'Updates', 'U'),
    i('messages', 'Messages', 'M'),
    avatar(),
  ],
}

const BTN: CSSProperties = {
  position: 'relative',
  width: 40,
  height: 40,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 11,
  cursor: 'pointer',
  flex: '0 0 auto',
  transition: 'background .15s ease',
  border: 'none',
  background: 'transparent',
  padding: 0,
  color: FROST.ink,
}

export function Widget({ apiBase, forceMode }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [tip, setTip] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [openPanel, setOpenPanel] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`${apiBase}/api/notch/me`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setUser(d.user ?? null))
      .catch(() => setUser(null))
  }, [apiBase])

  const loggedIn = !!user
  const mode: NotchMode = forceMode ?? (loggedIn ? 'visitor' : 'anonymous')
  const slots = MODES[mode]

  // Favicon of the embedding site as the avatar source (owner = this page).
  const faviconUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/favicon.ico` : ''

  // Mock identity of the page owner (host page) — used by the visitor-mode
  // "message the owner" suggestion until real owner detection is wired.
  const owner = {
    name:
      (typeof document !== 'undefined' && document.title) ||
      (typeof window !== 'undefined' ? window.location.hostname : 'this site'),
    avatarSrc: faviconUrl,
    seed: typeof window !== 'undefined' ? window.location.hostname : 'site',
  }

  const closePanel = () => {
    setOpenPanel(null)
    setExpanded(false)
  }

  const tipTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearTipTimer = () => {
    if (tipTimer.current) {
      clearTimeout(tipTimer.current)
      tipTimer.current = null
    }
  }
  // Flash a description, then let it "pop off" after ~1s — a quick peek.
  const peekTip = (id: string) => {
    clearTipTimer()
    setTip(id)
    tipTimer.current = setTimeout(() => {
      setTip(null)
      tipTimer.current = null
    }, 1000)
  }
  useEffect(() => clearTipTimer, [])

  // While a panel is open, dismiss it on outside click or Escape.
  useEffect(() => {
    if (!openPanel) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) closePanel()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePanel()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [openPanel])

  const collapse = () => {
    setExpanded(false)
    setTip(null)
    setHovered(null)
    clearTipTimer()
  }

  return (
    <div
      ref={rootRef}
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 2147483647,
        fontFamily: "'Manrope', system-ui, -apple-system, sans-serif",
        display: 'flex',
        alignItems: 'flex-end',
      }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => {
        if (!openPanel) collapse()
      }}
    >
      {openPanel === 'messages' && (
        <MessagesPanel mode={mode} owner={owner} onClose={closePanel} />
      )}

      {/* The shell: a logo circle when closed, a pill row when expanded. */}
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: 6,
          background: FROST.surface,
          color: FROST.ink,
          border: FROST.border,
          boxShadow: FROST.shadow,
          backdropFilter: FROST.blur,
          WebkitBackdropFilter: FROST.blur,
          borderRadius: expanded ? 28 : 999,
          transition: expanded
            ? 'border-radius .28s ease'
            : 'border-radius .18s ease',
          boxSizing: 'border-box',
        }}
      >
        {/* Logo — closed-state glyph; collapses away as the notch expands. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: 40,
            color: FROST.logo,
            overflow: 'hidden',
            maxWidth: expanded ? 0 : 40,
            opacity: expanded ? 0 : 1,
            transition: expanded
              ? 'max-width .16s ease, opacity .12s ease'
              : 'max-width .18s ease .04s, opacity .14s ease .04s',
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: '0 0 auto',
            }}
          >
            <VetkaMark size={33} variant="lean" />
          </div>
        </div>

        {/* Trailing items — collapsed to width 0 when closed, expand on hover. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            overflow: expanded ? 'visible' : 'hidden',
            maxWidth: expanded ? 600 : 0,
            opacity: expanded ? 1 : 0,
            transition: expanded
              ? 'max-width .28s ease, opacity .18s ease .12s'
              : 'max-width .16s ease, opacity .1s ease',
          }}
        >
          {slots.map((slot) => {
            const showTip = expanded && tip === slot.id
            const isMessages = slot.kind === 'icon' && slot.key === 'messages'
            const active = isMessages && openPanel === 'messages'
            return (
              <button
                key={slot.id}
                type="button"
                onClick={
                  isMessages
                    ? () =>
                        setOpenPanel((p) => (p === 'messages' ? null : 'messages'))
                    : undefined
                }
                style={{
                  ...BTN,
                  background:
                    active || (hovered === slot.id && slot.kind === 'icon')
                      ? FROST.hoverBg
                      : 'transparent',
                }}
                onMouseEnter={() => {
                  setHovered(slot.id)
                  peekTip(slot.id)
                }}
                onMouseLeave={() => {
                  setHovered(null)
                  clearTipTimer()
                  setTip(null)
                }}
              >
                {slot.kind === 'avatar' ? (
                  mode === 'owner' ? (
                    // Owner: favicon of the current site, facehash fallback.
                    <Avatar src={faviconUrl} seed={user?.email ?? 'anon'} />
                  ) : (
                    // Visitor: the viewer's own avatar from the API, facehash fallback.
                    <Avatar src={user?.image ?? undefined} seed={user?.email ?? 'anon'} />
                  )
                ) : (
                  <NotchIcon name={slot.key} size={25} />
                )}

                {showTip && (
                  <span
                    style={{
                      position: 'absolute',
                      bottom: 'calc(100% + 11px)',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 10px',
                      borderRadius: 10,
                      background: FROST.tipBg,
                      color: FROST.tipInk,
                      fontSize: 14,
                      lineHeight: 1,
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      boxShadow: '0 6px 18px rgba(0,0,0,.22)',
                      pointerEvents: 'none',
                      zIndex: 5,
                      fontFamily: "'Manrope', system-ui, sans-serif",
                      animation: 'notch-tip-in .12s ease-out',
                    }}
                  >
                    <span>{slot.label}</span>
                    {slot.kind === 'icon' && slot.sc && (
                      <span
                        style={{
                          fontSize: 13,
                          padding: '3px 6px',
                          borderRadius: 6,
                          background: FROST.tipChipBg,
                          color: 'inherit',
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontWeight: 500,
                        }}
                      >
                        ⌘{slot.sc}
                      </span>
                    )}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

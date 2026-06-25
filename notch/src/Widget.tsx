import { useState, useEffect, useRef, type CSSProperties } from 'react'
import { NotchIcon, type IconName } from './NotchIcon'

// Frost — dark glass (the recommended universal default, per local-drafts/README.md).
// Survives pure white, body text, and photos where the light-tinted glass disappears.
const FROST = {
  surface: 'rgba(20,20,26,.42)',
  ink: '#ffffff',
  logo: '#ffffff',
  radius: 22,
  border: '1px solid rgba(255,255,255,.16)',
  shadow: '0 10px 30px rgba(0,0,0,.24)',
  blur: 'blur(16px) saturate(170%)',
  hoverBg: 'rgba(255,255,255,.14)',
  divider: 'rgba(255,255,255,.20)',
  tipBg: 'rgba(10,10,14,.82)',
  tipInk: '#ffffff',
  tipChipBg: 'rgba(255,255,255,.18)',
}

interface User {
  name: string
  email: string
}

interface Props {
  apiBase: string
}

type Item = {
  key: IconName
  label: string
  sc: string | null
}

// Order + labels + shortcuts from NotchFrame.dc.html's `base`.
const ITEMS: Item[] = [
  { key: 'feed', label: 'Updates', sc: 'U' },
  { key: 'messages', label: 'Messages', sc: 'M' },
  { key: 'following', label: 'Following', sc: 'F' },
  { key: 'stamp', label: 'Leave a stamp', sc: 'S' },
  { key: 'more', label: 'More', sc: null },
]

const ICON_BTN: CSSProperties = {
  position: 'relative',
  width: 32,
  height: 32,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 9,
  cursor: 'pointer',
  flex: '0 0 auto',
  transition: 'background .15s ease',
  border: 'none',
  background: 'transparent',
  padding: 0,
  color: FROST.ink,
}

export function Widget({ apiBase }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [tip, setTip] = useState<IconName | null>(null)
  const [hovered, setHovered] = useState<IconName | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [user, setUser] = useState<User | null | undefined>(undefined)

  useEffect(() => {
    fetch(`${apiBase}/api/notch/me`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setUser(d.user ?? null))
      .catch(() => setUser(null))
  }, [apiBase])

  const loading = user === undefined
  const loggedIn = !!user

  const tipTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTipTimer = () => {
    if (tipTimer.current) {
      clearTimeout(tipTimer.current)
      tipTimer.current = null
    }
  }

  // Flash an icon's description, then let it "pop off" after ~1s even while the
  // pointer stays — a quick peek, as if guessing what the button is for.
  const peekTip = (key: IconName) => {
    clearTipTimer()
    setTip(key)
    tipTimer.current = setTimeout(() => {
      setTip(null)
      tipTimer.current = null
    }, 1000)
  }

  // Clear any pending timer when the widget unmounts.
  useEffect(() => clearTipTimer, [])

  const collapse = () => {
    setExpanded(false)
    setTip(null)
    setHovered(null)
    setMenuOpen(false)
    clearTipTimer()
  }

  return (
    <div
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
      onMouseLeave={collapse}
    >
      {/* Overflow / account popover — anchored above the bar, opened from "More". */}
      <div
        style={{
          position: 'absolute',
          bottom: 'calc(100% + 10px)',
          right: 0,
          width: 220,
          opacity: menuOpen ? 1 : 0,
          transform: menuOpen
            ? 'translateY(0) scale(1)'
            : 'translateY(8px) scale(0.96)',
          transition: 'opacity .15s ease, transform .15s ease',
          pointerEvents: menuOpen ? 'auto' : 'none',
          background: FROST.surface,
          border: FROST.border,
          boxShadow: FROST.shadow,
          backdropFilter: FROST.blur,
          WebkitBackdropFilter: FROST.blur,
          borderRadius: 16,
          color: FROST.ink,
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: 14 }}>
          {loading ? (
            <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,.4)' }}>
              …
            </p>
          ) : loggedIn ? (
            <div>
              <p
                style={{
                  margin: '0 0 4px',
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: '.12em',
                  color: 'rgba(255,255,255,.4)',
                }}
              >
                Signed in as
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: 14,
                  fontWeight: 600,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {user!.name}
              </p>
              <p
                style={{
                  margin: '2px 0 0',
                  fontSize: 12,
                  color: 'rgba(255,255,255,.45)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {user!.email}
              </p>
            </div>
          ) : (
            <div>
              <p
                style={{
                  margin: '0 0 10px',
                  fontSize: 13,
                  color: 'rgba(255,255,255,.55)',
                }}
              >
                Not signed in
              </p>
              <a
                href={`${apiBase}/`}
                style={{
                  display: 'block',
                  textAlign: 'center',
                  fontSize: 13,
                  fontWeight: 600,
                  color: FROST.ink,
                  border: '1px solid rgba(255,255,255,.22)',
                  borderRadius: 9,
                  padding: '8px 12px',
                  textDecoration: 'none',
                }}
              >
                Sign in →
              </a>
            </div>
          )}
        </div>
      </div>

      {/* The pill shell */}
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          flexDirection: 'row',
          padding: 5,
          background: FROST.surface,
          color: FROST.ink,
          borderRadius: FROST.radius,
          border: FROST.border,
          boxShadow: FROST.shadow,
          backdropFilter: FROST.blur,
          WebkitBackdropFilter: FROST.blur,
          boxSizing: 'border-box',
        }}
      >
        {/* Logo button — the closed-state glyph, always present */}
        <div
          style={{
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 9,
            flex: '0 0 auto',
            cursor: 'pointer',
            color: FROST.logo,
          }}
        >
          <NotchIcon name="logo" />
        </div>

        {/* Trailing item group — collapses to width 0 when closed, expands on hover */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            overflow: expanded ? 'visible' : 'hidden',
            maxWidth: expanded ? 360 : 0,
            opacity: expanded ? 1 : 0,
            marginLeft: expanded ? 4 : 0,
            transition:
              'max-width .2s ease, opacity .15s ease, margin-left .2s ease',
          }}
        >
          {ITEMS.map((item) => {
            const isMore = item.key === 'more'
            const active = isMore && menuOpen
            const showTip = expanded && tip === item.key && !active
            return (
              <button
                key={item.key}
                type="button"
                onClick={isMore ? () => setMenuOpen((o) => !o) : undefined}
                style={{
                  ...ICON_BTN,
                  background:
                    hovered === item.key || active
                      ? FROST.hoverBg
                      : 'transparent',
                }}
                onMouseEnter={() => {
                  setHovered(item.key)
                  peekTip(item.key)
                }}
                onMouseLeave={() => {
                  setHovered(null)
                  clearTipTimer()
                  setTip(null)
                }}
              >
                <NotchIcon name={item.key} />

                {showTip && (
                  <span
                    style={{
                      position: 'absolute',
                      bottom: 'calc(100% + 9px)',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '5px 8px',
                      borderRadius: 8,
                      background: FROST.tipBg,
                      color: FROST.tipInk,
                      fontSize: 11,
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
                    <span>{item.label}</span>
                    {item.sc && (
                      <span
                        style={{
                          fontSize: 10,
                          padding: '2px 5px',
                          borderRadius: 5,
                          background: FROST.tipChipBg,
                          color: 'inherit',
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontWeight: 500,
                        }}
                      >
                        ⌘{item.sc}
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

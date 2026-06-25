import {
  useState,
  useEffect,
  useRef,
  useLayoutEffect,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { NotchIcon, type IconName } from './NotchIcon'
import { VetkaMark } from './VetkaMark'
import { Avatar } from './Avatar'
import { MessagesPanel } from './MessagesPanel'
import { FollowsPanel } from './FollowsPanel'
import { ReactionsOverlay } from './ReactionsOverlay'
import { createReaction, type Signal } from './reactions-data'
import { setFollow } from './follows-data'

const SIGNALS: { key: Signal; label: string }[] = [
  { key: 'heart', label: 'Love this' },
  { key: 'star', label: 'A standout' },
  { key: 'fire', label: 'This is great' },
  { key: 'wow', label: 'That surprised me' },
  { key: 'like', label: 'Agree' },
  { key: 'idea', label: 'Insightful' },
  { key: 'save', label: 'Keep for later' },
  { key: 'question', label: 'I have a question' },
]

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
  handle?: string | null
  domain?: string | null
}

// Resolved context for the site the widget is embedded on (GET /api/notch/site).
interface SiteCtx {
  site: { id: string; domain: string } | null
  owner: { id: string; name: string; image: string | null; handle: string; seed: string } | null
  viewerIsOwner: boolean
  viewerSiteId: string | null
  viewerFollowsOwner: boolean
}

interface Props {
  apiBase: string
  // Dev override to preview a specific state (?notch=owner etc). When unset the
  // mode is derived from auth (owner detection needs the server — see /me).
  forceMode?: NotchMode | null
  // Dev override: treat this hostname as the current site instead of
  // window.location.hostname (?notch-domain=example.com on the host page).
  forceDomain?: string | null
}

// A trailing slot is either an icon button or the avatar (signed-in account).
type Slot =
  | { id: string; kind: 'icon'; key: IconName; label: string }
  | { id: string; kind: 'avatar'; label: string }

const i = (key: IconName, label: string): Slot => ({
  id: key,
  kind: 'icon',
  key,
  label,
})
const avatar = (): Slot => ({ id: 'avatar', kind: 'avatar', label: 'Account' })

const MODES: Record<NotchMode, Slot[]> = {
  // 1. Not logged in: log in + who this site's owner follows.
  anonymous: [i('login', 'Log in'), i('follows', 'Following')],
  // 2. Logged in, own site: feed, messages, reactions overlay, avatar.
  owner: [
    i('feed', 'Updates'),
    i('messages', 'Messages'),
    i('reactions', 'Reactions'),
    avatar(),
  ],
  // 3. Logged in, someone else's site: follow, follows, react, reactions, feed, messages, avatar.
  visitor: [
    i('follow', 'Follow'),
    i('follows', 'Follows'),
    i('react', 'React'),
    i('reactions', 'Reactions'),
    i('feed', 'Updates'),
    i('messages', 'Messages'),
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
  borderRadius: 999,
  cursor: 'pointer',
  flex: '0 0 auto',
  transition: 'background .15s ease',
  border: 'none',
  background: 'transparent',
  padding: 0,
  color: FROST.ink,
}

const TIP_BASE: CSSProperties = {
  position: 'absolute',
  bottom: 'calc(100% + 11px)',
  background: FROST.tipBg,
  color: FROST.tipInk,
  borderRadius: 10,
  boxShadow: '0 6px 18px rgba(0,0,0,.22)',
  pointerEvents: 'none',
  zIndex: 5,
  whiteSpace: 'nowrap',
  fontFamily: "'Overused Grotesk', system-ui, sans-serif",
  animation: 'notch-tip-in .12s ease-out',
}

// A hover tooltip that centers over its icon, then shifts horizontally so it
// never spills past the viewport edges (the bar sits at the bottom-right).
function Tip({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [left, setLeft] = useState<number | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    const btn = el?.offsetParent as HTMLElement | null
    if (!el || !btn) return
    const tipW = el.offsetWidth
    const btnRect = btn.getBoundingClientRect()
    const margin = 8
    let l = btn.offsetWidth / 2 - tipW / 2 // centered, button-relative
    const min = margin - btnRect.left
    const max = window.innerWidth - margin - tipW - btnRect.left
    l = Math.max(min, Math.min(l, max))
    setLeft(l)
  }, [])

  return (
    <span
      ref={ref}
      style={{
        ...TIP_BASE,
        ...style,
        left: left == null ? '50%' : left,
        transform: left == null ? 'translateX(-50%)' : 'none',
        visibility: left == null ? 'hidden' : 'visible',
      }}
    >
      {children}
    </span>
  )
}

export function Widget({ apiBase, forceMode, forceDomain }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [tip, setTip] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [ctx, setCtx] = useState<SiteCtx | null>(null)
  const [openPanel, setOpenPanel] = useState<string | null>(null)
  const [following, setFollowing] = useState(false)
  const followPending = useRef(false)
  const rootRef = useRef<HTMLDivElement>(null)
  // The login tab opened on the vetka origin (kept so we can close it on success).
  const loginPopup = useRef<Window | null>(null)

  // Reactions state
  const [showOverlay, setShowOverlay] = useState(false)
  const [reactMode, setReactMode] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickedSignal, setPickedSignal] = useState<Signal | null>(null)

  const loadUser = () =>
    fetch(`${apiBase}/api/notch/me`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setUser(d.user ?? null))
      .catch(() => setUser(null))

  // Resolve the host site so we can tell owner from visitor and surface the
  // owner's real identity for the "message the owner" suggestion. Re-runs after
  // login because viewerIsOwner / viewerFollowsOwner depend on the session.
  const loadCtx = () => {
    const host = forceDomain ?? (typeof window !== 'undefined' ? window.location.hostname : '')
    if (!host) return
    fetch(`${apiBase}/api/notch/site?domain=${encodeURIComponent(host)}`, {
      credentials: 'include',
    })
      .then((r) => r.json())
      .then((d) => setCtx(d))
      .catch(() => setCtx(null))
  }

  useEffect(() => {
    loadUser()
    loadCtx()
  }, [apiBase, forceDomain])

  // Log in by handing off to the vetka home page (the widget runs cross-origin on
  // third-party sites and can't host the auth UI / OAuth redirects). The home page
  // posts back `vetka:login` on success; we then refresh session-derived state and
  // close the tab so focus returns here.
  const startLogin = () => {
    loginPopup.current = window.open(
      `${apiBase}/?notch_login=1`,
      'vetka-login',
      'width=460,height=680',
    )
  }

  useEffect(() => {
    let vetkaOrigin = ''
    try {
      vetkaOrigin = new URL(apiBase).origin
    } catch {}
    const onMessage = (e: MessageEvent) => {
      if (vetkaOrigin && e.origin !== vetkaOrigin) return
      if (e.data !== 'vetka:login') return
      loginPopup.current?.close()
      loginPopup.current = null
      loadUser()
      loadCtx()
      try {
        window.focus()
      } catch {}
    }
    // Fallback for paths that can't post back (e.g. the Tangled OAuth redirect
    // navigates the tab away): re-check the session whenever we regain focus
    // while a login tab is/was open.
    const onFocus = () => {
      if (!loginPopup.current) return
      loadUser()
      loadCtx()
      if (loginPopup.current.closed) loginPopup.current = null
    }
    window.addEventListener('message', onMessage)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('message', onMessage)
      window.removeEventListener('focus', onFocus)
    }
  }, [apiBase])

  // Seed the Follow button from the server-resolved relationship.
  useEffect(() => {
    setFollowing(!!ctx?.viewerFollowsOwner)
  }, [ctx])

  const loggedIn = !!user
  const mode: NotchMode =
    forceMode ?? (!loggedIn ? 'anonymous' : ctx?.viewerIsOwner ? 'owner' : 'visitor')
  const slots = MODES[mode]

  // Favicon of the embedding site as the avatar source (owner = this page).
  const faviconUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/favicon.ico` : ''

  // Identity of the page owner — real (resolved from /site) when the host is a
  // registered site, else a best-effort fallback from the page itself.
  const owner = {
    id: ctx?.owner?.id ?? null,
    name:
      ctx?.owner?.name ||
      (typeof document !== 'undefined' && document.title) ||
      (typeof window !== 'undefined' ? window.location.hostname : 'this site'),
    src: ctx?.owner?.image ?? faviconUrl,
    seed:
      ctx?.owner?.seed ??
      (typeof window !== 'undefined' ? window.location.hostname : 'site'),
  }

  // Whose follows the Follows panel shows: the host owner's site when browsing
  // anonymously, the viewer's own site once signed in.
  const followsSubject = mode === 'anonymous' ? ctx?.site?.id ?? null : ctx?.viewerSiteId ?? null

  // Subscribe to / unsubscribe from the owner of the page the notch sits on.
  // Optimistic flip with revert on failure (mirrors FollowsPanel's rows).
  const toggleFollow = async () => {
    if (!owner.id || followPending.current) return
    const next = !following
    setFollowing(next)
    followPending.current = true
    const ok = await setFollow(apiBase, owner.id, next)
    if (!ok) setFollowing(!next)
    followPending.current = false
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

  // Escape cancels react mode / picker
  useEffect(() => {
    if (!reactMode && !pickerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setReactMode(false)
        setPickerOpen(false)
        setPickedSignal(null)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [reactMode, pickerOpen])

  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const collapse = () => {
    setExpanded(false)
    setTip(null)
    setHovered(null)
    clearTipTimer()
  }
  const scheduleCollapse = () => {
    if (collapseTimer.current) clearTimeout(collapseTimer.current)
    collapseTimer.current = setTimeout(collapse, 600)
  }
  const cancelCollapse = () => {
    if (collapseTimer.current) {
      clearTimeout(collapseTimer.current)
      collapseTimer.current = null
    }
  }
  useEffect(() => cancelCollapse, [])

  const domain = forceDomain ?? (typeof window !== 'undefined' ? window.location.hostname : '')
  const pageUrl = typeof window !== 'undefined' ? window.location.href : ''

  return (
    <div
      ref={rootRef}
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 2147483647,
        fontFamily: "'Overused Grotesk', system-ui, -apple-system, sans-serif",
        display: 'flex',
        alignItems: 'flex-end',
      }}
      onMouseEnter={() => { cancelCollapse(); setExpanded(true) }}
      onMouseLeave={() => {
        if (!openPanel) scheduleCollapse()
      }}
    >
      {openPanel === 'messages' && (
        <MessagesPanel mode={mode} owner={owner} apiBase={apiBase} onClose={closePanel} />
      )}
      {openPanel === 'follows' && (
        <FollowsPanel
          mode={mode}
          owner={owner}
          apiBase={apiBase}
          of={followsSubject}
          onClose={closePanel}
        />
      )}

      {/* Signal picker — floats above the notch bar when "react" is clicked */}
      {pickerOpen && (
        <SignalPicker
          apiBase={apiBase}
          onPick={(signal) => {
            setPickerOpen(false)
            setPickedSignal(signal)
            setReactMode(true)
            setShowOverlay(true)
          }}
        />
      )}

      {/* Reactions overlay — portaled into document.body */}
      {(showOverlay || reactMode) && user && (
        <ReactionsOverlay
          domain={domain}
          pageUrl={pageUrl}
          reactMode={reactMode}
          pickedSignal={pickedSignal}
          apiBase={apiBase}
          onPlace={(x, y) => {
            if (!pickedSignal) return
            createReaction({
              pageUrl,
              domain,
              signal: pickedSignal,
              x,
              y,
              authorName: user.domain ?? user.handle ?? user.name,
              authorSeed: user.email,
            })
            setReactMode(false)
            setPickedSignal(null)
          }}
        />
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
            // Icons that open a popup panel (keyed by the icon name).
            const panelKey =
              slot.kind === 'icon' && (slot.key === 'messages' || slot.key === 'follows')
                ? slot.key
                : null
            const isAvatar = slot.kind === 'avatar'
            const isFollow = slot.kind === 'icon' && slot.key === 'follow'
            const isLogin = slot.kind === 'icon' && slot.key === 'login'
            const isReactions = slot.kind === 'icon' && slot.key === 'reactions'
            const isReact = slot.kind === 'icon' && slot.key === 'react'
            // The follow button reads as "on" while subscribed, like an open panel.
            const active =
              (panelKey != null && openPanel === panelKey) ||
              (isFollow && following) ||
              (isReactions && showOverlay) ||
              (isReact && (pickerOpen || reactMode))
            return (
              <button
                key={slot.id}
                type="button"
                onClick={
                  panelKey
                    ? () => setOpenPanel((p) => (p === panelKey ? null : panelKey))
                    : isFollow
                      ? toggleFollow
                      : isLogin
                        ? startLogin
                        : isReactions
                          ? () => setShowOverlay((v) => !v)
                          : isReact
                            ? () => {
                                setPickerOpen((v) => !v)
                                if (reactMode) {
                                  setReactMode(false)
                                  setPickedSignal(null)
                                }
                              }
                            : isAvatar
                              ? () => window.open(`${apiBase}/`, '_blank', 'noopener')
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

                {showTip &&
                  (isAvatar && user ? (
                    // Account: show which identity is signed in (a user may have
                    // several sites/accounts, so make the active one explicit).
                    <Tip
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        gap: 3,
                        padding: '8px 11px',
                      }}
                    >
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          letterSpacing: '.08em',
                          textTransform: 'uppercase',
                          color: 'rgba(255,255,255,.5)',
                          lineHeight: 1,
                        }}
                      >
                        Signed in
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.1 }}>
                        {user.handle ?? user.domain ?? user.name}
                      </span>
                      {(user.domain || user.handle) && (
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 400,
                            color: 'rgba(255,255,255,.6)',
                            lineHeight: 1.1,
                          }}
                        >
                          {user.domain ?? user.handle}
                        </span>
                      )}
                    </Tip>
                  ) : (
                    <Tip
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '6px 10px',
                        fontSize: 14,
                        lineHeight: 1,
                        fontWeight: 600,
                      }}
                    >
                      {isFollow ? (following ? 'Unfollow' : 'Follow') : slot.label}
                    </Tip>
                  ))}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// Signal picker — a 4×2 grid of chip stickers that floats above the notch bar.
function SignalPicker({
  apiBase,
  onPick,
}: {
  apiBase: string
  onPick: (signal: Signal) => void
}) {
  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 12px)',
        right: 0,
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 48px)',
        gap: 8,
        padding: '14px 14px',
        background: 'rgba(18,18,24,.92)',
        border: '1px solid rgba(255,255,255,.12)',
        borderRadius: 18,
        boxShadow: '0 16px 48px rgba(0,0,0,.45)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        animation: 'notch-panel-in .16s ease-out',
        transformOrigin: 'bottom right',
        zIndex: 10,
      }}
    >
      {SIGNALS.map(({ key, label }) => (
        <SignalChip key={key} signal={key} label={label} apiBase={apiBase} onPick={onPick} />
      ))}
    </div>
  )
}

function SignalChip({
  signal,
  label,
  apiBase,
  onPick,
}: {
  signal: Signal
  label: string
  apiBase: string
  onPick: (signal: Signal) => void
}) {
  const [hover, setHover] = useState(false)
  return (
    <button
      type="button"
      title={label}
      onClick={() => onPick(signal)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 48,
        height: 48,
        background: hover ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.08)',
        borderRadius: 13,
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background .12s ease, transform .1s ease',
        transform: hover ? 'scale(1.10)' : 'none',
        padding: 0,
      }}
    >
      <img
        src={`${apiBase}/reactions/${signal}.svg`}
        alt={label}
        style={{ width: '62%', height: '62%', display: 'block' }}
        draggable={false}
      />
    </button>
  )
}

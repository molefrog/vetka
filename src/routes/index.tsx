import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { createAuthorizationUrl } from '@atcute/oauth-browser-client'
import { ensureOAuthConfigured } from '../lib/oauth'
import { useSession, signIn, signOut, signUp } from '../lib/auth-client'
import { getPostLoginDestination } from '../lib/session-fns'
import { VetkaLogo } from '../components/VetkaLogo'

export const Route = createFileRoute('/')({ component: HomePage })

// ---------------------------------------------------------------------------
// Fake data
// ---------------------------------------------------------------------------

// Global feed = updates from live sites that have a page snapshot. Loaded from
// GET /api/feed; each entry carries a bit of info about the person plus their
// site's `domain`, from which we derive the latest page snapshot (`snapshotUrl`).
type FeedUpdate = { name: string; domain: string; action: string; time: string }

const NOTIFICATIONS = [
  { text: 'misha.tngl.sh reacted on your site', time: '5m ago' },
  { text: 'cat.io left a comment', time: '1h ago' },
  { text: 'anna.tngl.sh started following you', time: '3h ago' },
]

const NEW_MEMBERS = ['cat.io', 'evan.xyz', 'igor.me', 'lena.io', 'petya.site']

// ---------------------------------------------------------------------------
// Shared bits — soft, Notch-flavoured list primitives
// ---------------------------------------------------------------------------

// Small-caps section header in the Anthony display face (used outside the notch bar).
// Anthony is single-weight 400 (synthesis disabled), so presence comes from a larger
// size + near-black ink rather than font-weight.
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-5 h-13 flex items-center font-display text-[16px] uppercase tracking-[0.1em] text-zinc-900 border-b border-black/[0.08]">
      {children}
    </div>
  )
}

// Circular monochrome avatar — first letter of the label, Notch row pattern.
function Avatar({ label }: { label: string }) {
  return (
    <span className="w-7 h-7 rounded-full bg-black/5 text-zinc-500 text-xs font-medium flex items-center justify-center shrink-0">
      {label[0]?.toUpperCase()}
    </span>
  )
}

// Latest page snapshot for a site. Served by GET /api/sites/$domain/snapshot, which
// streams the most recent `site_image` blob. The endpoint 404s until the first
// capture lands — `FeedSnapshot` falls back to a placeholder in that window.
const snapshotUrl = (domain: string) => `/api/sites/${encodeURIComponent(domain)}/snapshot`

// Framed 4:3 preview of a followed site's current page (stored snapshots are 800×600).
// Shows a branded placeholder while loading and when no snapshot exists yet.
function FeedSnapshot({ domain }: { domain: string }) {
  const [state, setState] = useState<'loading' | 'ok' | 'empty'>('loading')
  return (
    <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden border border-black/[0.08] bg-black/[0.03]">
      <img
        src={snapshotUrl(domain)}
        alt={`Latest snapshot of ${domain}`}
        loading="lazy"
        onLoad={() => setState('ok')}
        onError={() => setState('empty')}
        className={`w-full h-full object-cover object-top transition-opacity duration-200 ${
          state === 'ok' ? 'opacity-100' : 'opacity-0'
        }`}
      />
      {state !== 'ok' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-zinc-400">
          <VetkaLogo variant="lean" size={22} className="opacity-30" />
          <span className="text-xs">
            {state === 'loading' ? 'Loading snapshot…' : 'Snapshot coming soon'}
          </span>
        </div>
      )}
    </div>
  )
}

// One global-feed entry: the page snapshot on the side (click → opens their
// site) with info about the person beside it, aligned to the bottom.
function FeedItem({ item }: { item: FeedUpdate }) {
  return (
    <div className="px-3 py-5 rounded-2xl hover:bg-black/[0.04] transition-colors">
      <div className="flex gap-6">
        <a
          href={`https://${item.domain}`}
          target="_blank"
          rel="noopener noreferrer"
          title={`Open ${item.domain}`}
          className="block w-[520px] max-w-[62%] shrink-0 transition-opacity hover:opacity-90"
        >
          <FeedSnapshot domain={item.domain} />
        </a>
        <div className="flex min-w-0 flex-col justify-end pb-1">
          <div className="flex items-center gap-2">
            <Avatar label={item.name} />
            <span className="text-[15px] font-semibold leading-tight truncate">{item.name}</span>
          </div>
          <a
            href={`https://${item.domain}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 text-[13.5px] text-zinc-400 leading-tight truncate hover:text-zinc-600 hover:underline underline-offset-2"
          >
            {item.domain}
          </a>
          <div className="mt-1 text-[13.5px] text-zinc-500 leading-snug">{item.action}</div>
          <div className="mt-1 text-xs text-zinc-400">{item.time}</div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function HomePage() {
  const { data: session } = useSession()
  const [showLogin, setShowLogin] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  // True when this tab was opened by the Notch widget purely to log in. In that
  // mode a successful login posts back to the widget and closes the tab instead
  // of routing into onboarding (the visitor may not own a site).
  const [notchLogin, setNotchLogin] = useState(false)
  const [feed, setFeed] = useState<FeedUpdate[] | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const user = session?.user
  const initial = user?.name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase()

  // Load the global feed (live sites that have a page snapshot).
  useEffect(() => {
    let alive = true
    fetch('/api/feed')
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => alive && setFeed(d.items ?? []))
      .catch(() => alive && setFeed([]))
    return () => {
      alive = false
    }
  }, [])

  // Set in an effect (not render) to avoid an SSR/client hydration mismatch.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('notch_login')) {
      setNotchLogin(true)
      setShowLogin(true)
    }
  }, [])

  // Already authenticated when the widget hands off (or just became so): notify
  // the opener and close this tab so focus returns to the user's site.
  useEffect(() => {
    if (notchLogin && session?.user) {
      window.opener?.postMessage('vetka:login', '*')
      window.close()
    }
  }, [notchLogin, session])

  useEffect(() => {
    if (!menuOpen) return
    function onClickOutside(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [menuOpen])

  return (
    <div className="min-h-screen bg-white text-black text-sm">
      {/* Navbar */}
      <nav className="border-b border-black/[0.08] px-5 h-16 flex items-center shrink-0">
        <span className="font-display flex items-center gap-2 text-[40px] leading-none">
          <VetkaLogo variant="lean" size={40} />
          Vetka
        </span>
        <div className="ml-auto flex items-center gap-5">
          {user ? (
            <>
              <span className="text-zinc-500">{NOTIFICATIONS.length} notifications</span>
              <a href="/sites" className="underline underline-offset-2">
                Edit site →
              </a>
              <div ref={menuRef} className="relative">
                <button
                  onClick={() => setMenuOpen((o) => !o)}
                  className="w-8 h-8 rounded-full bg-black/5 text-zinc-600 flex items-center justify-center text-xs font-medium hover:bg-black/10 transition-colors"
                >
                  {initial}
                </button>
                {menuOpen && (
                  <div className="anim-tip-in absolute right-0 top-full mt-2 w-44 rounded-[14px] border border-black/[0.08] bg-white/80 backdrop-blur-xl shadow-[0_16px_40px_rgba(0,0,0,0.12)] overflow-hidden p-1 z-50">
                    <a
                      href="/sites"
                      className="block px-3 py-2 rounded-[9px] hover:bg-black/[0.04]"
                      onClick={() => setMenuOpen(false)}
                    >
                      Edit site →
                    </a>
                    <a
                      href="/sites"
                      className="block px-3 py-2 rounded-[9px] hover:bg-black/[0.04]"
                      onClick={() => setMenuOpen(false)}
                    >
                      My sites
                    </a>
                    <button
                      onClick={async () => {
                        setMenuOpen(false)
                        await signOut()
                        window.location.reload()
                      }}
                      className="w-full text-left px-3 py-2 rounded-[9px] hover:bg-black/[0.04] text-zinc-500"
                    >
                      Log out
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <button
              onClick={() => setShowLogin(true)}
              className="underline underline-offset-2"
            >
              Log in
            </button>
          )}
        </div>
      </nav>

      <div className="flex" style={{ minHeight: 'calc(100vh - 65px)' }}>
        {/* Feed */}
        <main className="flex-1 border-r border-black/[0.08]">
          <SectionLabel>Global feed</SectionLabel>
          <div className="px-2 py-1.5">
            {feed === null ? (
              <div className="px-3 py-6 text-zinc-400">Loading feed…</div>
            ) : feed.length === 0 ? (
              <div className="px-3 py-6 text-zinc-400">No updates yet.</div>
            ) : (
              feed.map((item, i) => <FeedItem key={item.domain + i} item={item} />)
            )}
          </div>
        </main>

        {/* Right sidebar */}
        <aside className="w-72 shrink-0">
          {user && (
            <>
              <SectionLabel>Notifications</SectionLabel>
              <div className="px-2 py-1.5">
                {NOTIFICATIONS.map((n, i) => (
                  <div key={i} className="px-3 py-2 rounded-xl hover:bg-black/[0.04] transition-colors">
                    <div className="text-[13.5px] leading-snug">{n.text}</div>
                    <div className="text-xs text-zinc-400 mt-0.5">{n.time}</div>
                  </div>
                ))}
              </div>
            </>
          )}
          <SectionLabel>New members</SectionLabel>
          <div className="px-2 py-1.5">
            {NEW_MEMBERS.map((domain, i) => (
              <div
                key={i}
                className="px-3 py-2 rounded-xl flex items-center gap-3 hover:bg-black/[0.04] cursor-default transition-colors"
              >
                <Avatar label={domain} />
                <span className="text-[15px] font-semibold leading-tight">{domain}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>

      {showLogin && (
        <LoginModal notchLogin={notchLogin} onClose={() => setShowLogin(false)} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Login modal
// ---------------------------------------------------------------------------

function LoginModal({
  notchLogin = false,
  onClose,
}: {
  notchLogin?: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const { data: session } = useSession()
  const [tab, setTab] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [handle, setHandle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (session?.user) {
    onClose()
    return null
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (tab === 'signup') {
        const res = await signUp.email({ email, password, name })
        if (res.error) throw new Error(res.error.message)
      } else {
        const res = await signIn.email({ email, password })
        if (res.error) throw new Error(res.error.message)
      }
      // Notch hand-off: signal the widget and close, skipping onboarding.
      if (notchLogin) {
        window.opener?.postMessage('vetka:login', '*')
        window.close()
        return
      }
      const dest = await getPostLoginDestination()
      if (dest !== '/') {
        router.navigate({ to: dest })
      } else {
        onClose()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleTangledSignIn(e: React.FormEvent) {
    e.preventDefault()
    if (!handle.trim()) return
    setError(null)
    setLoading(true)
    try {
      ensureOAuthConfigured()
      const url = await createAuthorizationUrl({
        scope: 'atproto transition:generic',
        target: { type: 'account', identifier: handle.trim() as `${string}.${string}` },
      })
      window.location.href = url.toString()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start Tangled sign-in')
      setLoading(false)
    }
  }

  const inputCls =
    'w-full px-4 py-2 text-sm rounded-full bg-black/[0.04] border border-transparent outline-none focus:bg-white focus:border-black/[0.12] transition-colors placeholder:text-zinc-400'

  return (
    <div
      className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="anim-panel-in bg-white rounded-[22px] border border-black/[0.08] shadow-[0_16px_40px_rgba(0,0,0,0.12)] overflow-hidden w-full max-w-xs"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 space-y-4">
          {/* Tabs — segmented pill */}
          <div className="flex p-1 rounded-full bg-black/5">
            {(['login', 'signup'] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(null) }}
                className={`flex-1 h-8 text-sm rounded-full transition-colors ${
                  tab === t ? 'bg-black text-white' : 'text-zinc-500 hover:text-black'
                }`}
              >
                {t === 'login' ? 'Log in' : 'Sign up'}
              </button>
            ))}
          </div>

          <form onSubmit={handleEmailSubmit} className="space-y-2">
            {tab === 'signup' && (
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
                required
                className={inputCls}
              />
            )}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              required
              autoComplete="email"
              className={inputCls}
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
              autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
              className={inputCls}
            />
            {error && <p className="text-xs text-red-600 px-1">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 text-sm rounded-full bg-black text-white hover:bg-zinc-800 disabled:opacity-40 transition-colors"
            >
              {loading ? '…' : tab === 'login' ? 'Log in' : 'Create account'}
            </button>
          </form>

          <div className="border-t border-black/[0.06] pt-4">
            <form onSubmit={handleTangledSignIn} className="space-y-2">
              <input
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="handle.tngl.sh"
                autoCapitalize="none"
                autoComplete="off"
                className={inputCls}
              />
              <button
                type="submit"
                disabled={!handle.trim() || loading}
                className="w-full py-2 text-sm rounded-full border border-black/[0.12] hover:bg-black/[0.04] disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
              >
                <svg viewBox="0 0 32 32" fill="currentColor" xmlns="http://www.w3.org/2000/svg" width="16" height="16" aria-hidden="true">
                  <path d="M21.0971 30.866C20.0566 30.8575 19.2628 30.5542 18.4016 30.0269C17.1668 29.3753 16.2237 28.2808 15.5497 27.0739C14.4789 28.4065 13.0476 29.215 11.4453 29.6718C10.763 29.8705 9.56809 30.0721 7.58737 29.3523C4.73277 28.3905 2.65342 25.4114 2.88973 22.3758C2.8465 21.1175 3.30392 19.8825 3.95228 18.8208C2.22264 17.8897 0.81225 16.3266 0.272148 14.4098C-0.0560731 13.3604 -0.042271 12.2299 0.0787626 11.1512C0.512215 8.60429 2.41697 6.38956 4.86912 5.59294C5.8479 3.35574 7.98378 1.68743 10.4037 1.34778C12.0104 1.12338 13.6735 1.46075 15.0792 2.27979C17.1272 0.00158595 20.6952 -0.671697 23.4195 0.727793C25.4978 1.72322 26.9839 3.80003 27.3447 6.06471C29.3222 6.85928 30.9877 8.47971 31.6413 10.5368C32.0784 11.8104 32.0928 13.2132 31.8098 14.5209C31.3041 16.5615 29.8679 18.2987 28.009 19.2482C28.0135 19.6113 29.2037 22.2296 29.0047 24.2056C28.9612 26.676 27.399 29.0172 25.2325 30.1544C23.9683 30.8945 22.4702 30.8805 21.0971 30.866ZM15.1733 23.755C16.9256 23.5593 18.0743 22.0269 18.9665 20.6469C19.3883 20.0182 19.7105 19.3146 20.0306 18.6454C20.4458 19.0271 20.7975 19.7461 21.4541 19.9173C22.1457 20.1333 22.9566 19.9579 23.38 19.3277C24.1902 17.8118 23.7908 15.9827 23.319 14.4119C23.0284 13.5097 22.6472 12.5841 21.9218 11.9446C22.0765 10.85 21.4299 9.73834 20.5106 9.16542C19.7272 9.79198 18.5352 9.78821 17.7794 9.11795C16.3309 10.5997 15.0034 10.5505 13.7212 9.37618C13.4331 9.11226 12.8832 10.9871 10.9535 9.92506C9.84488 10.8567 8.98526 11.753 8.22356 13.0435C7.48342 14.4347 6.70829 15.6703 6.64151 17.1811C6.6094 18.0641 7.29731 18.9892 8.22942 18.9174C9.16105 19.0009 9.7952 18.0813 10.5006 17.6993C10.6058 18.9316 10.7243 20.2556 11.1395 21.4587C11.6161 23.0155 13.2947 24.005 14.8835 23.7784C14.9959 23.7696 15.1733 23.7549 15.1733 23.755ZM16.0828 19.1062C15.2306 18.5823 15.6407 17.4452 15.6066 16.6193C15.6914 15.6227 15.7594 14.575 16.2061 13.667C16.6788 13.0197 17.8318 13.2694 17.8827 14.0999C17.8488 14.9353 17.4664 15.767 17.5121 16.633C17.4129 17.3561 17.5839 18.1684 17.265 18.8293C17.0033 19.195 16.4703 19.3013 16.0828 19.1062ZM12.3606 18.6302C11.5578 18.1933 11.8129 17.0941 11.687 16.3298C11.7914 15.445 11.7045 14.3226 12.4431 13.7021C13.1653 13.1969 14.1485 14.0621 13.8069 14.8564C13.4426 15.8602 13.6814 16.957 13.6891 17.9748C13.5512 18.5752 12.911 18.894 12.3606 18.6302Z" />
                </svg>
                Continue with Tangled
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

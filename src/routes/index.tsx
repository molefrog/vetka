import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { useSession, signIn, signOut, authClient } from '../lib/auth-client'
import { getPostLoginDestination, getRecentMembers } from '../lib/session-fns'
import { VetkaLogo } from '../components/VetkaLogo'

export const Route = createFileRoute('/')({
  loader: () => getRecentMembers(),
  component: HomePage,
})

// ---------------------------------------------------------------------------
// Fake data
// ---------------------------------------------------------------------------

// Global feed = updates from live sites that have a page snapshot. Loaded from
// GET /api/feed; each entry carries a bit of info about the person plus their
// site's `domain`, from which we derive the latest page snapshot (`snapshotUrl`).
type FeedUpdate = { name: string; domain: string; action: string; time: string }

const NOTIFICATIONS = [
  { text: 'misha.web.sh reacted on your site', time: '5m ago' },
  { text: 'cat.io left a comment', time: '1h ago' },
  { text: 'anna.web.sh started following you', time: '3h ago' },
]

function displayDomain(domain: string): string {
  return domain.replace(/\.vercel\.app$/, '')
}

// ---------------------------------------------------------------------------
// Shared bits — soft, Notch-flavoured list primitives
// ---------------------------------------------------------------------------

// Small-caps section header as an elevated pill chip (Notch convention) in the
// Anthony display face. Anthony is single-weight 400 (synthesis disabled), so
// presence comes from size + a soft grey backing rather than font-weight.
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pt-4 pb-2">
      <span className="inline-flex items-center rounded-full bg-black/[0.05] px-3.5 py-1.5 font-display text-[15px] uppercase tracking-[0.1em] text-zinc-700">
        {children}
      </span>
    </div>
  )
}

// Feed selector chip — pill with a clear active (filled) vs inactive (ghost) state.
function TabPill({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 font-display text-[15px] uppercase tracking-[0.1em] transition-colors ${
        active
          ? 'bg-black/[0.06] text-zinc-900'
          : 'text-zinc-400 hover:bg-black/[0.04] hover:text-zinc-600'
      }`}
    >
      {children}
    </button>
  )
}

// Scroll-direction watcher: drives the sticky header (hide buttons on scroll-down,
// reveal on scroll-up; `atTop` shrinks the logo to its icon). rAF-throttled, with
// an 8px dead-zone so small jitters don't flip the direction.
function useScrollDirection() {
  const [state, setState] = useState<{ direction: 'up' | 'down'; atTop: boolean }>({
    direction: 'up',
    atTop: true,
  })
  useEffect(() => {
    let lastY = window.scrollY
    let ticking = false
    function update() {
      const y = window.scrollY
      const atTop = y < 24
      if (Math.abs(y - lastY) > 8) {
        setState({ direction: y > lastY ? 'down' : 'up', atTop })
        lastY = y
      } else {
        setState((s) => (s.atTop === atTop ? s : { ...s, atTop }))
      }
      ticking = false
    }
    function onScroll() {
      if (!ticking) {
        ticking = true
        requestAnimationFrame(update)
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return state
}

// How many sidebar rows fit the pinned rail at the current viewport height, so the
// rail never scrolls or clips mid-row. Approximate row/header heights (px); recomputed
// on resize. SSR-safe: seeds with a tall default and refines on mount.
function useFitCounts(hasNotifications: boolean): { notifCap: number; memberCap: number } {
  const [h, setH] = useState(typeof window === 'undefined' ? 900 : window.innerHeight)
  useEffect(() => {
    const onResize = () => setH(window.innerHeight)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const TOP = 64 + 16 // nav zone + first section header's top padding
  const HEADER = 48 // a SectionLabel pill block
  const MEMBER_ROW = 44
  const NOTIF_ROW = 52 // two-line notification row
  const BOTTOM = 16

  let avail = h - TOP - BOTTOM
  let notifCap = 0
  if (hasNotifications) {
    avail -= HEADER
    notifCap = Math.min(3, Math.max(0, Math.floor(avail / NOTIF_ROW)))
    avail -= notifCap * NOTIF_ROW
  }
  avail -= HEADER // New members header
  const memberCap = Math.max(0, Math.floor(avail / MEMBER_ROW))
  return { notifCap, memberCap }
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

// Framed 16:9 preview of a followed site's current page (stored snapshots are 1280×720).
// Shows a branded placeholder while loading and when no snapshot exists yet.
function FeedSnapshot({ domain }: { domain: string }) {
  const [state, setState] = useState<'loading' | 'ok' | 'empty'>('loading')
  return (
    <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-black/[0.08] bg-black/[0.03]">
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
          <VetkaLogo size={22} className="opacity-30" />
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
      <div className="flex flex-col gap-4 md:flex-row md:gap-6">
        <a
          href={`https://${item.domain}`}
          target="_blank"
          rel="noopener noreferrer"
          title={`Open ${item.domain}`}
          className="block w-full shrink-0 transition-opacity hover:opacity-90 md:w-[58%] md:max-w-[620px]"
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
  const members = Route.useLoaderData()
  const { data: session } = useSession()
  const [showLogin, setShowLogin] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  // True when this tab was opened by the Notch widget purely to log in. In that
  // mode a successful login posts back to the widget and closes the tab instead
  // of routing into onboarding (the visitor may not own a site).
  const [notchLogin, setNotchLogin] = useState(false)
  const [tab, setTab] = useState<'global' | 'friends'>('global')
  const [feed, setFeed] = useState<FeedUpdate[] | null>(null)
  const [feedNeedsAuth, setFeedNeedsAuth] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const { direction, atTop } = useScrollDirection()
  // Hide the action buttons + tabs while scrolling down; the logo shrinks to its
  // icon once away from the top.
  const buttonsHidden = direction === 'down' && !atTop

  const user = session?.user
  const initial = user?.name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase()
  // Row counts that keep the pinned sidebar within one screen height.
  const { notifCap, memberCap } = useFitCounts(!!user)

  // Load the active feed (global = every live site with a snapshot; friends =
  // only sites the viewer follows). Refetched whenever the tab changes.
  useEffect(() => {
    let alive = true
    setFeed(null)
    setFeedNeedsAuth(false)
    fetch(`/api/feed?scope=${tab}`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => {
        if (!alive) return
        setFeed(d.items ?? [])
        setFeedNeedsAuth(!!d.requiresAuth)
      })
      .catch(() => alive && setFeed([]))
    return () => {
      alive = false
    }
  }, [tab])

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
      {/* Floating pill nav — no bar. The logo sits on its own frosted pill (icon+text
          ⇄ icon); the action cluster floats opposite it. Both fade on scroll-down and
          return on scroll-up. The 64px sticky strip is transparent, so feed content
          scrolls under the pills. */}
      <header className="sticky top-0 z-40 px-4 h-16 flex items-center justify-between pointer-events-none">
        <a
          href="/"
          className="pointer-events-auto inline-flex items-center rounded-full p-1 border border-white/10 backdrop-blur-md font-display text-[30px] leading-none text-white"
          style={{
            background: 'rgba(24,24,27,0.55)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.14)',
          }}
        >
          <span className="flex h-10 w-10 items-center justify-center shrink-0">
            <VetkaLogo size={32} />
          </span>
          <span
            // -translate-y nudges the wordmark up for *optical* centering against the
            // mark — Anthony's line box sits the glyphs low, so box-centering looks off.
            className={`-translate-y-[3px] overflow-hidden whitespace-nowrap transition-all duration-200 ${
              buttonsHidden ? 'max-w-0 opacity-0' : 'max-w-[160px] opacity-100 pl-1 pr-3'
            }`}
          >
            Vetka
          </span>
        </a>
        <div
          className={`pointer-events-auto transition-all duration-200 ${
            buttonsHidden ? '-translate-y-2 opacity-0 pointer-events-none' : ''
          }`}
        >
          {user ? (
            <div className="flex items-center gap-3 rounded-full bg-white/70 backdrop-blur-md ring-1 ring-black/[0.06] pl-4 pr-1.5 py-1.5">
              <span className="text-zinc-500">{NOTIFICATIONS.length} notifications</span>
              <a
                href="/sites"
                className="rounded-full bg-black px-4 py-1.5 text-sm text-white hover:bg-zinc-800 transition-colors"
              >
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
            </div>
          ) : (
            <button
              onClick={() => setShowLogin(true)}
              className="rounded-full bg-black px-4 py-1.5 text-sm text-white hover:bg-zinc-800 transition-colors"
            >
              Log in
            </button>
          )}
        </div>
      </header>

      <div className="flex" style={{ minHeight: 'calc(100vh - 64px)' }}>
        {/* Feed. TODO(branches): dimmed tree-root lines weave through this background. */}
        <main className="flex-1 min-w-0">
          {/* Feed tabs — a floating frosted segmented control pinned under the nav,
              aligned with the sidebar headers. Collapse on scroll-down, return on
              scroll-up. */}
          <div
            className={`sticky top-16 z-30 px-3 overflow-hidden transition-all duration-200 ${
              buttonsHidden ? 'max-h-0 pt-0 pb-0 opacity-0 -translate-y-1 pointer-events-none' : 'max-h-20 pt-4 pb-2 opacity-100'
            }`}
          >
            <div
              role="tablist"
              className="inline-flex items-center gap-1 rounded-full bg-white/70 backdrop-blur-md ring-1 ring-black/[0.06] p-1"
            >
              <TabPill active={tab === 'global'} onClick={() => setTab('global')}>
                Global
              </TabPill>
              <TabPill active={tab === 'friends'} onClick={() => setTab('friends')}>
                Friends
              </TabPill>
            </div>
          </div>
          <div className="px-2 py-1.5">
            {feed === null ? (
              <div className="px-3 py-6 text-zinc-400">Loading feed…</div>
            ) : feedNeedsAuth ? (
              <div className="px-3 py-8 flex flex-col items-start gap-3 text-zinc-400">
                <span>Log in to see updates from sites you follow.</span>
                <button
                  onClick={() => setShowLogin(true)}
                  className="rounded-full bg-black px-4 py-1.5 text-sm text-white hover:bg-zinc-800 transition-colors"
                >
                  Log in
                </button>
              </div>
            ) : feed.length === 0 ? (
              <div className="px-3 py-6 text-zinc-400">
                {tab === 'friends' ? "You're not following anyone yet." : 'No updates yet.'}
              </div>
            ) : (
              feed.map((item, i) => <FeedItem key={item.domain + i} item={item} />)
            )}
          </div>
        </main>

        {/* Right sidebar — a pinned rail that stays put while the feed scrolls; rows
            are capped to fit one screen height (no rail/page scroll). Hidden on narrow
            screens so the feed gets the full width. */}
        <aside className="hidden lg:flex w-72 shrink-0 flex-col sticky top-16 self-start h-[calc(100vh-64px)] overflow-hidden">
          {user && (
            <>
              <SectionLabel>Notifications</SectionLabel>
              <div className="px-2 py-1.5">
                {NOTIFICATIONS.slice(0, notifCap).map((n, i) => (
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
            {members.slice(0, memberCap).map((domain, i) => (
              <a
                key={i}
                href={`https://${domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 rounded-xl flex items-center gap-3 hover:bg-black/[0.04] transition-colors"
              >
                <Avatar label={domain} />
                <span className="text-[15px] font-semibold leading-tight">{displayDomain(domain)}</span>
              </a>
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
  const [step, setStep] = useState<'email' | 'otp'>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (session?.user) {
    onClose()
    return null
  }

  // After any successful auth: hand back to the Notch widget, or route into
  // onboarding / the hub.
  async function finishLogin() {
    if (notchLogin) {
      window.opener?.postMessage('vetka:login', '*')
      window.close()
      return
    }
    const dest = await getPostLoginDestination()
    if (dest !== '/') router.navigate({ to: dest })
    else onClose()
  }

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setError(null)
    setLoading(true)
    try {
      const res = await authClient.emailOtp.sendVerificationOtp({ email: email.trim(), type: 'sign-in' })
      if (res.error) throw new Error(res.error.message)
      setStep('otp')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send code')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (!otp.trim()) return
    setError(null)
    setLoading(true)
    try {
      const res = await signIn.emailOtp({ email: email.trim(), otp: otp.trim() })
      if (res.error) throw new Error(res.error.message)
      await finishLogin()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code')
      setLoading(false)
    }
  }

  async function handleSocial(provider: 'google' | 'github') {
    setError(null)
    setLoading(true)
    try {
      // OAuth redirects away; come back to the hub and let routing decide.
      await signIn.social({ provider, callbackURL: window.location.origin })
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not start ${provider} sign-in`)
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
          <div className="text-center">
            <h2 className="font-display text-lg">Sign in to Vetka</h2>
            <p className="mt-0.5 text-xs text-zinc-400">
              {step === 'email' ? 'We’ll email you a one-time code.' : `Enter the code sent to ${email}.`}
            </p>
          </div>

          {step === 'email' ? (
            <form onSubmit={handleSendCode} className="space-y-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                required
                autoComplete="email"
                autoFocus
                className={inputCls}
              />
              {error && <p className="text-xs text-red-600 px-1">{error}</p>}
              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full py-2 text-sm rounded-full bg-black text-white hover:bg-zinc-800 disabled:opacity-40 transition-colors"
              >
                {loading ? '…' : 'Send code'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerify} className="space-y-2">
              <input
                type="text"
                inputMode="numeric"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="6-digit code"
                required
                autoFocus
                maxLength={6}
                className={`${inputCls} tracking-[0.3em] text-center`}
              />
              {error && <p className="text-xs text-red-600 px-1">{error}</p>}
              <button
                type="submit"
                disabled={loading || otp.length < 6}
                className="w-full py-2 text-sm rounded-full bg-black text-white hover:bg-zinc-800 disabled:opacity-40 transition-colors"
              >
                {loading ? '…' : 'Verify & continue'}
              </button>
              <button
                type="button"
                onClick={() => { setStep('email'); setOtp(''); setError(null) }}
                className="w-full text-xs text-zinc-400 hover:text-zinc-700"
              >
                ← Use a different email
              </button>
            </form>
          )}

          <div className="flex items-center gap-3 text-[11px] text-zinc-300">
            <span className="h-px flex-1 bg-black/[0.08]" />
            or
            <span className="h-px flex-1 bg-black/[0.08]" />
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => handleSocial('google')}
              disabled={loading}
              className="w-full py-2 text-sm rounded-full border border-black/[0.12] hover:bg-black/[0.04] disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
            >
              <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
                <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 01-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62z" />
                <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 009 18z" />
                <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 010-3.44V4.95H.96a9 9 0 000 8.1l3.01-2.33z" />
                <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 00.96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
              </svg>
              Continue with Google
            </button>
            <button
              type="button"
              onClick={() => handleSocial('github')}
              disabled={loading}
              className="w-full py-2 text-sm rounded-full border border-black/[0.12] hover:bg-black/[0.04] disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              Continue with GitHub
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

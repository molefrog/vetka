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

const FEED = [
  { domain: 'misha.tngl.sh', action: 'updated their site', time: '2m ago' },
  { domain: 'cat.io', action: 'joined Vetka', time: '18m ago' },
  { domain: 'oleg.design', action: '3 new reactions', time: '1h ago' },
  { domain: 'anna.tngl.sh', action: 'updated their site', time: '2h ago' },
  { domain: 'evan.xyz', action: 'joined Vetka', time: '3h ago' },
  { domain: 'sasha.me', action: '12 new reactions', time: '4h ago' },
  { domain: 'dima.tngl.sh', action: 'updated their site', time: '5h ago' },
  { domain: 'lena.io', action: 'joined Vetka', time: '6h ago' },
  { domain: 'petya.site', action: '1 new reaction', time: '7h ago' },
  { domain: 'vasya.tngl.sh', action: 'updated their site', time: '8h ago' },
  { domain: 'igor.me', action: 'joined Vetka', time: '9h ago' },
  { domain: 'marta.tngl.sh', action: 'updated their site', time: '10h ago' },
]

const NOTIFICATIONS = [
  { text: 'misha.tngl.sh reacted on your site', time: '5m ago' },
  { text: 'cat.io left a comment', time: '1h ago' },
  { text: 'anna.tngl.sh started following you', time: '3h ago' },
]

const NEW_MEMBERS = ['cat.io', 'evan.xyz', 'igor.me', 'lena.io', 'petya.site']

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
  const menuRef = useRef<HTMLDivElement>(null)

  const user = session?.user
  const initial = user?.name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase()

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
      <nav className="border-b border-black px-4 h-16 flex items-center shrink-0">
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
                  className="w-6 h-6 border border-black flex items-center justify-center text-xs hover:bg-zinc-50"
                >
                  {initial}
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-full mt-px w-40 border border-black bg-white z-50">
                    <a
                      href="/sites"
                      className="block px-3 py-2 hover:bg-zinc-50 border-b border-black"
                      onClick={() => setMenuOpen(false)}
                    >
                      Edit site →
                    </a>
                    <a
                      href="/sites"
                      className="block px-3 py-2 hover:bg-zinc-50 border-b border-black"
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
                      className="w-full text-left px-3 py-2 hover:bg-zinc-50 text-zinc-500"
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
        <main className="flex-1 border-r border-black">
          <div className="border-b border-black px-4 h-8 flex items-center text-xs text-zinc-500">
            Global feed
          </div>
          {FEED.map((item, i) => (
            <div
              key={i}
              className="border-b border-black px-4 py-2.5 flex items-baseline gap-2 hover:bg-zinc-50 cursor-default"
            >
              <span className="font-medium">{item.domain}</span>
              <span className="text-zinc-500">— {item.action}</span>
              <span className="ml-auto text-xs text-zinc-400 shrink-0">{item.time}</span>
            </div>
          ))}
        </main>

        {/* Right sidebar */}
        <aside className="w-64 shrink-0">
          {user && (
            <>
              <div className="border-b border-black px-4 h-8 flex items-center text-xs text-zinc-500">
                Notifications
              </div>
              {NOTIFICATIONS.map((n, i) => (
                <div key={i} className="border-b border-black px-4 py-2.5">
                  <div>{n.text}</div>
                  <div className="text-xs text-zinc-400 mt-0.5">{n.time}</div>
                </div>
              ))}
              <div className="h-4" />
            </>
          )}
          <div className="border-b border-black px-4 h-8 flex items-center text-xs text-zinc-500">
            New members
          </div>
          {NEW_MEMBERS.map((domain, i) => (
            <div key={i} className="border-b border-black px-4 py-2.5">
              {domain}
            </div>
          ))}
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

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white border border-black w-full max-w-xs"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Tabs */}
        <div className="border-b border-black flex">
          {(['login', 'signup'] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(null) }}
              className={`flex-1 h-9 text-sm border-r last:border-r-0 border-black ${
                tab === t ? 'bg-black text-white' : 'hover:bg-zinc-50'
              }`}
            >
              {t === 'login' ? 'Log in' : 'Sign up'}
            </button>
          ))}
        </div>

        <div className="p-4 space-y-3">
          <form onSubmit={handleEmailSubmit} className="space-y-2">
            {tab === 'signup' && (
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
                required
                className="w-full px-2 py-1.5 text-sm border border-black outline-none focus:bg-zinc-50"
              />
            )}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              required
              autoComplete="email"
              className="w-full px-2 py-1.5 text-sm border border-black outline-none focus:bg-zinc-50"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
              autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
              className="w-full px-2 py-1.5 text-sm border border-black outline-none focus:bg-zinc-50"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-1.5 text-sm bg-black text-white hover:bg-zinc-800 disabled:opacity-40"
            >
              {loading ? '…' : tab === 'login' ? 'Log in' : 'Create account'}
            </button>
          </form>

          <div className="border-t border-black pt-3">
            <form onSubmit={handleTangledSignIn} className="space-y-2">
              <input
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="handle.tngl.sh"
                autoCapitalize="none"
                autoComplete="off"
                className="w-full px-2 py-1.5 text-sm border border-black outline-none focus:bg-zinc-50"
              />
              <button
                type="submit"
                disabled={!handle.trim() || loading}
                className="w-full py-1.5 text-sm border border-black hover:bg-zinc-50 disabled:opacity-40"
              >
                Continue with Tangled
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

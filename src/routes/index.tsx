import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { createAuthorizationUrl } from '@atcute/oauth-browser-client'
import { ensureOAuthConfigured } from '../lib/oauth'
import { useSession, signIn, signOut, signUp } from '../lib/auth-client'

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

const NEW_MEMBERS = [
  'cat.io', 'evan.xyz', 'igor.me', 'lena.io', 'petya.site',
]

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function HomePage() {
  const { data: session } = useSession()
  const [showLogin, setShowLogin] = useState(false)

  const user = session?.user
  const initial = user?.name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase()

  return (
    <div className="min-h-screen bg-white text-black text-sm">

      {/* Navbar */}
      <nav className="border-b border-black px-4 h-9 flex items-center shrink-0">
        <span>vetka</span>
        <div className="ml-auto flex items-center gap-5">
          {user ? (
            <>
              <span className="text-zinc-500">{NOTIFICATIONS.length} notifications</span>
              <a href="/agent" className="underline underline-offset-2">Edit site →</a>
              <button
                onClick={() => signOut()}
                className="w-6 h-6 border border-black flex items-center justify-center text-xs"
                title="Sign out"
              >
                {initial}
              </button>
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

      <div className="flex" style={{ minHeight: 'calc(100vh - 37px)' }}>

        {/* Feed */}
        <main className="flex-1 border-r border-black">
          <div className="border-b border-black px-4 h-8 flex items-center text-xs text-zinc-500">
            Global feed
          </div>
          {FEED.map((item, i) => (
            <div key={i} className="border-b border-black px-4 py-2.5 flex items-baseline gap-2 hover:bg-zinc-50 cursor-default">
              <span className="font-medium">{item.domain}</span>
              <span className="text-zinc-500">— {item.action}</span>
              <span className="ml-auto text-xs text-zinc-400 shrink-0">{item.time}</span>
            </div>
          ))}
        </main>

        {/* Right sidebar */}
        <aside className="w-64 shrink-0">
          {/* Notifications (logged in only) */}
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

          {/* New members (always visible) */}
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

      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Login modal
// ---------------------------------------------------------------------------

function LoginModal({ onClose }: { onClose: () => void }) {
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
        {/* Modal header */}
        <div className="border-b border-black px-4 h-9 flex items-center text-sm">
          <span>Sign in to Vetka</span>
          <button
            onClick={onClose}
            className="ml-auto text-zinc-400 hover:text-black leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-4 space-y-4 text-sm">
          {/* Tab switch */}
          <div className="flex border border-black">
            {(['login', 'signup'] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(null) }}
                className={`flex-1 py-1 ${tab === t ? 'bg-black text-white' : 'hover:bg-zinc-50'}`}
              >
                {t === 'login' ? 'Log in' : 'Sign up'}
              </button>
            ))}
          </div>

          {/* Email / password form */}
          <form onSubmit={handleEmailSubmit} className="space-y-2">
            {tab === 'signup' && (
              <input
                type="text" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Name" required
                className="w-full px-2 py-1.5 border border-black outline-none text-sm"
              />
            )}
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="Email" required autoComplete="email"
              className="w-full px-2 py-1.5 border border-black outline-none text-sm"
            />
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="Password" required
              autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
              className="w-full px-2 py-1.5 border border-black outline-none text-sm"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button
              type="submit" disabled={loading}
              className="w-full py-1.5 bg-black text-white disabled:opacity-40 hover:opacity-80"
            >
              {loading ? '…' : tab === 'login' ? 'Log in' : 'Sign up'}
            </button>
          </form>

          {/* Tangled */}
          <div className="border-t border-black pt-4 space-y-2">
            <div className="text-xs text-zinc-500">or with Tangled handle</div>
            <form onSubmit={handleTangledSignIn} className="space-y-2">
              <input
                type="text" value={handle} onChange={(e) => setHandle(e.target.value)}
                placeholder="your.handle.tngl.sh"
                autoCapitalize="none" autoComplete="off"
                className="w-full px-2 py-1.5 border border-black outline-none text-sm"
              />
              <button
                type="submit" disabled={!handle.trim() || loading}
                className="w-full py-1.5 border border-black disabled:opacity-40 hover:bg-zinc-50"
              >
                Continue with Tangled →
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { createAuthorizationUrl } from '@atcute/oauth-browser-client'
import { ensureOAuthConfigured } from '../lib/oauth'
import { signIn, signUp } from '../lib/auth-client'
import { cn } from '../lib/cn'

export const Route = createFileRoute('/')({ component: LandingPage })

function LandingPage() {
  const router = useRouter()
  const [tab, setTab] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [handle, setHandle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

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
      router.navigate({ to: '/dashboard' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleSignIn() {
    setError(null)
    setLoading(true)
    try {
      await signIn.social({ provider: 'google', callbackURL: '/dashboard' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed')
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
    <div className="min-h-screen flex">
      {/* Left: branding */}
      <div className="hidden lg:flex flex-col justify-between w-80 bg-zinc-900 text-white p-10 shrink-0">
        <div>
          <div className="text-2xl font-bold tracking-tight">Vetka</div>
          <p className="mt-3 text-sm text-zinc-400 leading-relaxed">
            Build and deploy your personal website with AI, or manage your Tangled repos.
          </p>
        </div>
        <p className="text-xs text-zinc-600">Powered by AT Protocol</p>
      </div>

      {/* Right: auth forms */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm space-y-8">
          <div className="lg:hidden">
            <h1 className="text-2xl font-bold">Vetka</h1>
          </div>

          {/* Regular auth (email / Google) */}
          <div className="space-y-4">
            <div className="flex gap-2 p-1 bg-zinc-100 rounded-lg">
              {(['login', 'signup'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => { setTab(t); setError(null) }}
                  className={cn(
                    'flex-1 py-1.5 text-sm font-medium rounded-md transition-colors',
                    tab === t ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500 hover:text-zinc-700',
                  )}
                >
                  {t === 'login' ? 'Log in' : 'Sign up'}
                </button>
              ))}
            </div>

            <form onSubmit={handleEmailSubmit} className="space-y-3">
              {tab === 'signup' && (
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Name"
                  required
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-zinc-200 focus:border-zinc-400 outline-none transition-colors bg-white"
                />
              )}
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                required
                autoComplete="email"
                className="w-full px-3 py-2.5 text-sm rounded-lg border border-zinc-200 focus:border-zinc-400 outline-none transition-colors bg-white"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
                autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
                className="w-full px-3 py-2.5 text-sm rounded-lg border border-zinc-200 focus:border-zinc-400 outline-none transition-colors bg-white"
              />
              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 text-sm font-medium rounded-lg bg-zinc-900 text-white hover:bg-zinc-700 disabled:opacity-40 transition-colors"
              >
                {loading ? '…' : tab === 'login' ? 'Log in' : 'Create account'}
              </button>
            </form>

            {process.env.GOOGLE_CLIENT_ID && (
              <>
                <div className="relative text-center text-xs text-zinc-400">
                  <span className="bg-zinc-50 px-2 relative z-10">or</span>
                  <div className="absolute inset-y-1/2 left-0 right-0 border-t border-zinc-200" />
                </div>
                <button
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                  className="w-full py-2.5 text-sm font-medium rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
                >
                  Continue with Google
                </button>
              </>
            )}
          </div>

          {/* Divider */}
          <div className="relative text-center text-xs text-zinc-400">
            <span className="bg-zinc-50 px-2 relative z-10">or sign in with Tangled</span>
            <div className="absolute inset-y-1/2 left-0 right-0 border-t border-zinc-200" />
          </div>

          {/* Tangled auth */}
          <form onSubmit={handleTangledSignIn} className="space-y-3">
            <input
              type="text"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="your.handle.tngl.sh"
              autoCapitalize="none"
              autoComplete="off"
              className="w-full px-3 py-2.5 text-sm rounded-lg border border-zinc-200 focus:border-zinc-400 outline-none transition-colors bg-white"
            />
            <button
              type="submit"
              disabled={!handle.trim() || loading}
              className="w-full py-2.5 text-sm font-medium rounded-lg border border-violet-200 bg-violet-50 text-violet-900 hover:bg-violet-100 disabled:opacity-40 transition-colors"
            >
              Continue with Tangled
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

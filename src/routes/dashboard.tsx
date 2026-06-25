import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { getAuthSession, getTangledIdentity } from '../lib/session-fns'
import { signOut } from '../lib/auth-client'
import { listSshKeys, addSshKey, type SshKey } from '../lib/tangled'
import { ensureOAuthConfigured } from '../lib/oauth'
import { cn } from '../lib/cn'
import { VetkaLogo } from '../components/VetkaLogo'

export const Route = createFileRoute('/dashboard')({ component: DashboardPage })

type TangledIdentity = {
  did: string
  handle: string
  selectedRepoUri: string | null
  selectedRepoName: string | null
  selectedRepoKnot: string | null
}

type AuthState =
  | { type: 'loading' }
  | { type: 'regular'; name: string; email: string }
  | { type: 'tangled'; name: string; tangled: TangledIdentity }
  | { type: 'unauthenticated' }

function DashboardPage() {
  const router = useRouter()
  const [auth, setAuth] = useState<AuthState>({ type: 'loading' })
  const [keys, setKeys] = useState<SshKey[]>([])
  const [keyName, setKeyName] = useState('')
  const [keyValue, setKeyValue] = useState('')
  const [keyError, setKeyError] = useState<string | null>(null)
  const [keySuccess, setKeySuccess] = useState(false)
  const [addingKey, setAddingKey] = useState(false)
  const [website, setWebsite] = useState('')
  const [savedWebsite, setSavedWebsite] = useState(false)

  useEffect(() => {
    async function loadAuth() {
      const session = await getAuthSession()
      if (!session?.user) {
        router.navigate({ to: '/' })
        return
      }

      const tangled = await getTangledIdentity()
      if (tangled) {
        setAuth({ type: 'tangled', name: session.user.name, tangled })
        try {
          ensureOAuthConfigured()
          setKeys(await listSshKeys())
        } catch {}
      } else {
        setAuth({ type: 'regular', name: session.user.name, email: session.user.email })
      }
    }
    loadAuth()
  }, [router])

  async function handleSignOut() {
    await signOut()
    router.navigate({ to: '/' })
  }

  async function handleAddKey(e: React.FormEvent) {
    e.preventDefault()
    if (!keyName.trim() || !keyValue.trim()) return
    setAddingKey(true)
    setKeyError(null)
    try {
      ensureOAuthConfigured()
      await addSshKey(keyName.trim(), keyValue.trim())
      setKeySuccess(true)
      setKeyName('')
      setKeyValue('')
      setKeys(await listSshKeys())
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : 'Failed to add key')
    } finally {
      setAddingKey(false)
    }
  }

  if (auth.type === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-zinc-400">Loading…</p>
      </div>
    )
  }

  if (auth.type === 'unauthenticated') return null

  const displayName =
    auth.type === 'tangled'
      ? `@${auth.tangled.handle !== auth.tangled.did ? auth.tangled.handle : auth.tangled.did.slice(-8)}`
      : auth.email

  return (
    <div className="min-h-screen px-4 py-10">
      <div className="max-w-2xl mx-auto space-y-10">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              <VetkaLogo size={22} />
              Vetka
            </div>
            <div className="text-sm text-zinc-400 mt-0.5">{displayName}</div>
          </div>
          <button
            onClick={handleSignOut}
            className="text-sm text-zinc-400 hover:text-zinc-900 transition-colors"
          >
            Sign out
          </button>
        </div>

        {/* Regular user: website management */}
        {auth.type === 'regular' && (
          <section className="space-y-4">
            <h2 className="text-sm font-medium text-zinc-500 uppercase tracking-wide">Your Website</h2>
            <div className="rounded-xl border border-zinc-200 bg-white p-5 space-y-4">
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">Website URL</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={website}
                    onChange={(e) => { setWebsite(e.target.value); setSavedWebsite(false) }}
                    placeholder="https://yoursite.com"
                    className="flex-1 px-3 py-2 text-sm rounded-lg border border-zinc-200 focus:border-zinc-400 outline-none transition-colors bg-zinc-50"
                  />
                  <button
                    onClick={() => setSavedWebsite(true)}
                    disabled={!website.trim()}
                    className="px-4 py-2 text-sm font-medium rounded-lg bg-zinc-900 text-white hover:bg-zinc-700 disabled:opacity-40 transition-colors"
                  >
                    Save
                  </button>
                </div>
                {savedWebsite && (
                  <p className="mt-1.5 text-xs text-emerald-600">Saved</p>
                )}
              </div>
              <p className="text-xs text-zinc-400">
                Specify your website URL to manage it here. No agent — you're in full control.
              </p>
            </div>
          </section>
        )}

        {/* Tangled user: repo + SSH keys + agent */}
        {auth.type === 'tangled' && (
          <>
            <section className="space-y-3">
              <h2 className="text-sm font-medium text-zinc-500 uppercase tracking-wide">Website Repo</h2>
              {auth.tangled.selectedRepoName ? (
                <div className="rounded-xl border border-zinc-200 bg-white p-4">
                  <div className="font-medium text-sm">{auth.tangled.selectedRepoName}</div>
                  <div className="text-xs text-zinc-400 mt-0.5">{auth.tangled.selectedRepoKnot}</div>
                  <div className="mt-3 text-xs text-zinc-500">
                    Your AI agent will build and push your website to this repo.
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-4 text-center">
                  <p className="text-sm text-zinc-400 mb-2">No repo selected yet</p>
                  <button
                    onClick={() => router.navigate({ to: '/select-repo' })}
                    className="text-sm text-violet-600 hover:text-violet-800 transition-colors"
                  >
                    Select a repo →
                  </button>
                </div>
              )}
            </section>

            <section className="space-y-3">
              <h2 className="text-sm font-medium text-zinc-500 uppercase tracking-wide">SSH Keys</h2>
              {keys.length > 0 && (
                <div className="space-y-2">
                  {keys.map((key) => (
                    <div key={key.uri} className="rounded-xl border border-zinc-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="font-medium text-sm">{key.name}</div>
                        <div className="text-xs text-zinc-400 shrink-0">
                          {new Date(key.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <code className="block text-xs font-mono text-zinc-400 truncate">
                        {key.key.slice(0, 60)}…
                      </code>
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-xl border border-zinc-200 bg-white p-4">
                <div className="text-sm font-medium mb-3">Add SSH key</div>
                {keySuccess && (
                  <p className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 mb-3">
                    Key added
                  </p>
                )}
                <form onSubmit={handleAddKey} className="space-y-3">
                  <input
                    type="text"
                    value={keyName}
                    onChange={(e) => { setKeyName(e.target.value); setKeySuccess(false) }}
                    placeholder="My laptop"
                    className={cn(
                      'w-full px-3 py-2 text-sm rounded-lg border bg-zinc-50 outline-none transition-colors',
                      'border-zinc-200 focus:border-zinc-400 placeholder:text-zinc-400',
                    )}
                  />
                  <textarea
                    value={keyValue}
                    onChange={(e) => { setKeyValue(e.target.value); setKeySuccess(false) }}
                    placeholder="ssh-ed25519 AAAA..."
                    rows={3}
                    className={cn(
                      'w-full px-3 py-2 text-sm font-mono rounded-lg border bg-zinc-50 resize-none outline-none transition-colors',
                      'border-zinc-200 focus:border-zinc-400 placeholder:text-zinc-400',
                    )}
                  />
                  {keyError && (
                    <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                      {keyError}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={addingKey || !keyName.trim() || !keyValue.trim()}
                    className="py-2 px-4 text-sm font-medium rounded-lg bg-zinc-900 text-white hover:bg-zinc-700 disabled:opacity-40 transition-colors"
                  >
                    {addingKey ? 'Adding…' : 'Add key'}
                  </button>
                </form>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}

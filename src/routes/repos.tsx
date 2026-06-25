import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { deleteStoredSession, listStoredSessions } from '@atcute/oauth-browser-client'
import type { Did } from '@atcute/lexicons'
import { ensureOAuthConfigured } from '../lib/oauth'
import { listRepos, listSshKeys, addSshKey, type Repo, type SshKey } from '../lib/tangled'
import { cn } from '../lib/cn'
import { VetkaLogo } from '../components/VetkaLogo'

export const Route = createFileRoute('/repos')({ component: ReposPage })

function ReposPage() {
  const router = useRouter()
  const [repos, setRepos] = useState<Repo[]>([])
  const [keys, setKeys] = useState<SshKey[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null)
  const [keyName, setKeyName] = useState('')
  const [keyValue, setKeyValue] = useState('')
  const [keyError, setKeyError] = useState<string | null>(null)
  const [keySuccess, setKeySuccess] = useState(false)
  const [addingKey, setAddingKey] = useState(false)

  useEffect(() => {
    ensureOAuthConfigured()
    if (listStoredSessions().length === 0) {
      router.navigate({ to: '/' })
      return
    }
    load()
  }, [router])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [r, k] = await Promise.all([listRepos(), listSshKeys()])
      setRepos(r)
      setKeys(k)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  async function signOut() {
    ensureOAuthConfigured()
    for (const did of listStoredSessions()) deleteStoredSession(did as Did)
    router.navigate({ to: '/' })
  }

  async function handleAddKey(e: React.FormEvent) {
    e.preventDefault()
    if (!keyName.trim() || !keyValue.trim()) return
    setAddingKey(true)
    setKeyError(null)
    try {
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-zinc-400">Loading…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-3">
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
          <button onClick={load} className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors">
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-4 py-10">
      <div className="max-w-2xl mx-auto space-y-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <VetkaLogo size={22} />
            Vetka
          </div>
          <button onClick={signOut} className="text-sm text-zinc-400 hover:text-zinc-900 transition-colors">
            Sign out
          </button>
        </div>

        <section>
          <h2 className="text-sm font-medium text-zinc-500 uppercase tracking-wide mb-3">Repositories</h2>
          {repos.length === 0 ? (
            <p className="text-sm text-zinc-400">No repos found.</p>
          ) : (
            <div className="space-y-2">
              {repos.map((repo) => (
                <div
                  key={repo.uri}
                  onClick={() => setSelectedRepo(selectedRepo?.uri === repo.uri ? null : repo)}
                  className={cn(
                    'rounded-xl border bg-white p-4 cursor-pointer transition-colors',
                    selectedRepo?.uri === repo.uri ? 'border-zinc-400' : 'border-zinc-200 hover:border-zinc-300',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-sm">{repo.name}</div>
                      {repo.description && (
                        <div className="text-xs text-zinc-400 mt-0.5 truncate">{repo.description}</div>
                      )}
                    </div>
                    <div className="text-xs text-zinc-400 shrink-0">{repo.knot}</div>
                  </div>
                  {selectedRepo?.uri === repo.uri && (
                    <div className="mt-3 pt-3 border-t border-zinc-100">
                      <div className="text-xs text-zinc-500 mb-1">SSH clone URL</div>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 text-xs font-mono bg-zinc-50 border border-zinc-200 rounded px-2 py-1.5 truncate">
                          {repo.sshUrl}
                        </code>
                        <button
                          onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(repo.sshUrl) }}
                          className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors shrink-0"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-sm font-medium text-zinc-500 uppercase tracking-wide mb-3">SSH Keys</h2>
          {keys.length > 0 && (
            <div className="space-y-2 mb-4">
              {keys.map((key) => (
                <div key={key.uri} className="rounded-xl border border-zinc-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="font-medium text-sm">{key.name}</div>
                    <div className="text-xs text-zinc-400 shrink-0">
                      {new Date(key.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <code className="block text-xs font-mono text-zinc-400 truncate">{key.key.slice(0, 60)}…</code>
                </div>
              ))}
            </div>
          )}
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="text-sm font-medium mb-3">Add SSH key</div>
            {keySuccess && (
              <p className="text-sm text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 mb-3">
                Key added successfully
              </p>
            )}
            <form onSubmit={handleAddKey} className="space-y-3">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Name</label>
                <input
                  type="text"
                  value={keyName}
                  onChange={(e) => { setKeyName(e.target.value); setKeySuccess(false) }}
                  placeholder="My laptop"
                  className={cn(
                    'w-full px-3 py-2 text-sm rounded-lg border bg-zinc-50',
                    'placeholder:text-zinc-400 outline-none',
                    'border-zinc-200 focus:border-zinc-400 transition-colors',
                  )}
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Public key</label>
                <textarea
                  value={keyValue}
                  onChange={(e) => { setKeyValue(e.target.value); setKeySuccess(false) }}
                  placeholder="ssh-ed25519 AAAA..."
                  rows={3}
                  className={cn(
                    'w-full px-3 py-2 text-sm font-mono rounded-lg border bg-zinc-50 resize-none',
                    'placeholder:text-zinc-400 outline-none',
                    'border-zinc-200 focus:border-zinc-400 transition-colors',
                  )}
                />
              </div>
              {keyError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{keyError}</p>
              )}
              <button
                type="submit"
                disabled={addingKey || !keyName.trim() || !keyValue.trim()}
                className={cn(
                  'py-2 px-4 text-sm font-medium rounded-lg transition-colors',
                  'bg-zinc-900 text-white hover:bg-zinc-700',
                  'disabled:opacity-40 disabled:cursor-not-allowed',
                )}
              >
                {addingKey ? 'Adding…' : 'Add key'}
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  )
}

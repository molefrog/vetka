import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { ensureOAuthConfigured } from '../lib/oauth'
import { listRepos, type Repo } from '../lib/tangled'
import { saveSelectedRepo, getTangledSession } from '../lib/session-fns'
import { cn } from '../lib/cn'

export const Route = createFileRoute('/select-repo')({ component: SelectRepoPage })

function SelectRepoPage() {
  const router = useRouter()
  const [repos, setRepos] = useState<Repo[]>([])
  const [selected, setSelected] = useState<Repo | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      // Check server session first
      const session = await getTangledSession()
      if (!session) {
        router.navigate({ to: '/' })
        return
      }
      // If repo already selected, go to dashboard
      if (session.selectedRepoUri) {
        router.navigate({ to: '/dashboard' })
        return
      }
      try {
        ensureOAuthConfigured()
        const r = await listRepos()
        setRepos(r)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load repos')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [router])

  async function handleConfirm() {
    if (!selected) return
    setSaving(true)
    try {
      await saveSelectedRepo({ data: { uri: selected.uri, name: selected.name, knot: selected.knot } })
      router.navigate({ to: '/dashboard' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-zinc-400">Loading repos…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Choose your website repo</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Select the Tangled repo where your website will be built and deployed.
          </p>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {repos.length === 0 ? (
          <p className="text-sm text-zinc-400">No repos found. Create one on Tangled first.</p>
        ) : (
          <div className="space-y-2">
            {repos.map((repo) => (
              <button
                key={repo.uri}
                onClick={() => setSelected(repo)}
                className={cn(
                  'w-full text-left rounded-xl border bg-white p-4 transition-colors',
                  selected?.uri === repo.uri
                    ? 'border-violet-400 bg-violet-50'
                    : 'border-zinc-200 hover:border-zinc-300',
                )}
              >
                <div className="font-medium text-sm">{repo.name}</div>
                {repo.description && (
                  <div className="text-xs text-zinc-400 mt-0.5">{repo.description}</div>
                )}
                <div className="text-xs text-zinc-400 mt-1">{repo.knot}</div>
              </button>
            ))}
          </div>
        )}

        <button
          onClick={handleConfirm}
          disabled={!selected || saving}
          className="w-full py-2.5 text-sm font-medium rounded-lg bg-zinc-900 text-white hover:bg-zinc-700 disabled:opacity-40 transition-colors"
        >
          {saving ? 'Saving…' : 'Continue'}
        </button>
      </div>
    </div>
  )
}

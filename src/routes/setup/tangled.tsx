import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { getAuthSession, getTangledIdentity, createSite, saveTangledSetup } from '../../lib/session-fns'
import { listRepos, listSshKeys, addSshKey, type Repo } from '../../lib/tangled'
import { ensureOAuthConfigured } from '../../lib/oauth'
import { cn } from '../../lib/cn'

export const Route = createFileRoute('/setup/tangled')({
  beforeLoad: async () => {
    const session = await getAuthSession()
    if (!session?.user) throw redirect({ to: '/' })
  },
  loader: async () => {
    const tangled = await getTangledIdentity()
    if (!tangled) throw redirect({ to: '/setup/script' })
    return { tangled }
  },
  component: SetupTangledPage,
})

function SetupTangledPage() {
  const router = useRouter()
  const { tangled } = Route.useLoaderData()
  const [repos, setRepos] = useState<Repo[]>([])
  const [selected, setSelected] = useState<Repo | null>(null)
  const [reposLoaded, setReposLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const domain = tangled.handle.startsWith('did:') ? null : tangled.handle

  // Build a fallback repo entry from what's already saved in the DB
  const existingRepo: Repo | null =
    tangled.selectedRepoUri && tangled.selectedRepoName
      ? { uri: tangled.selectedRepoUri, name: tangled.selectedRepoName, knot: tangled.selectedRepoKnot ?? 'tngl.sh' }
      : null

  useEffect(() => {
    // Pre-select whatever is already configured
    if (existingRepo) setSelected(existingRepo)

    try {
      ensureOAuthConfigured()
      listRepos()
        .then((r) => {
          setRepos(r)
          // If the live list loaded but doesn't include the existing repo, prepend it so it stays selectable
          if (existingRepo && !r.some((x) => x.uri === existingRepo.uri)) {
            setRepos([existingRepo, ...r])
          }
          setReposLoaded(true)
        })
        .catch(() => {
          // OAuth token missing (e.g. impersonation) — fall back to DB value
          if (existingRepo) setRepos([existingRepo])
          setReposLoaded(true)
        })
    } catch {
      if (existingRepo) setRepos([existingRepo])
      setReposLoaded(true)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    if (!selected || !domain) return
    setSaving(true)
    setError(null)
    try {
      // Step 1 (server): save repo selection + generate SSH keypair + upload to Files API.
      // This is mandatory — throws on any failure, which surfaces in the catch below.
      const knot = selected.knot ?? 'tngl.sh'
      const { sshPublicKey } = await saveTangledSetup({
        data: { uri: selected.uri, name: selected.name, knot },
      })

      // Step 2 (client/AT Protocol): register the public key with Tangled.
      // Uses the browser OAuth session stored by @atcute/oauth-browser-client.
      try {
        const existingKeys = await listSshKeys()
        const alreadyAdded = existingKeys.some((k) => k.key.trim() === sshPublicKey.trim())
        if (!alreadyAdded) {
          await addSshKey('vetka-agent', sshPublicKey)
        }
      } catch (keyErr) {
        // If the AT Protocol session has expired, the user needs to re-login with Tangled.
        // Bail out here so they don't reach the builder with an unregistered key.
        throw new Error(
          `Failed to register SSH key with Tangled: ${keyErr instanceof Error ? keyErr.message : String(keyErr)}. ` +
            'Try signing out and signing in with Tangled again.',
        )
      }

      // Step 3: create/update the site record.
      await createSite({
        data: {
          domain,
          isTangled: true,
          did: tangled.did,
          repoUri: selected.uri,
          repoName: selected.name,
          repoKnot: knot,
        },
      })

      router.navigate({ to: '/sites/$domain/builder', params: { domain } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set up site')
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div>
          <h1 className="font-display text-xl font-semibold">Choose your website repo</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {domain ? <>Your site will be at <strong>{domain}</strong></> : 'Select the repo for your site.'}
          </p>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {!reposLoaded ? (
          <p className="text-sm text-zinc-400">Loading repos…</p>
        ) : repos.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-zinc-500">
              No repos found. Create one on Tangled first, then come back here.
            </p>
            <a
              href="https://tangled.sh"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-violet-600 hover:text-violet-800"
            >
              Open Tangled →
            </a>
          </div>
        ) : (
          <div className="space-y-2">
            {repos.map((repo) => (
              <button
                key={repo.uri}
                onClick={() => setSelected(repo)}
                className={cn(
                  'w-full text-left rounded-lg border bg-white p-4 transition-colors',
                  selected?.uri === repo.uri
                    ? 'border-zinc-900 bg-zinc-50'
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
          onClick={handleSave}
          disabled={!selected || !domain || saving}
          className="w-full py-2.5 text-sm font-medium rounded-lg bg-zinc-900 text-white hover:bg-zinc-700 disabled:opacity-40 transition-colors"
        >
          {saving ? 'Setting up…' : 'Set up site'}
        </button>

        <a href="/" className="block text-center text-sm text-zinc-400 hover:text-zinc-700">
          Skip for now
        </a>
      </div>
    </div>
  )
}

import { createFileRoute, redirect, useRouter, Link } from '@tanstack/react-router'
import { useState } from 'react'
import {
  getAuthSession,
  createSite,
  checkSubdomain,
  SUBDOMAIN_ROOT,
  SUBDOMAIN_RE,
} from '../../lib/session-fns'
import { VetkaLogo } from '../../components/VetkaLogo'

export const Route = createFileRoute('/setup/generate')({
  beforeLoad: async () => {
    const session = await getAuthSession()
    if (!session?.user) throw redirect({ to: '/' })
  },
  component: GeneratePage,
})

function GeneratePage() {
  const router = useRouter()
  const [label, setLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const sub = label.trim().toLowerCase()
  const valid = SUBDOMAIN_RE.test(sub)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) {
      setError('Use lowercase letters, numbers and hyphens.')
      return
    }
    setError(null)
    setCreating(true)
    try {
      const check = await checkSubdomain({ data: sub })
      if (!check.available) {
        setError(check.reason === 'taken' ? 'That name is taken.' : 'That name can’t be used.')
        setCreating(false)
        return
      }
      const domain = `${sub}.${SUBDOMAIN_ROOT}`
      await createSite({ data: { domain, kind: 'generated', subdomain: sub } })
      router.navigate({ to: '/sites/$domain/builder', params: { domain } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create site')
      setCreating(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <div className="flex items-center gap-2">
            <VetkaLogo size={20} />
            <h1 className="font-display text-xl">Pick your address</h1>
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            Your site will live here. The AI agent builds it for you in the next step.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex items-center rounded-lg border border-zinc-200 focus-within:border-zinc-400 transition-colors bg-white overflow-hidden">
            <input
              type="text"
              value={label}
              onChange={(e) => { setLabel(e.target.value); setError(null) }}
              placeholder="evan"
              autoCapitalize="none"
              autoComplete="off"
              autoFocus
              className="flex-1 px-3 py-2.5 text-sm outline-none"
            />
            <span className="px-3 text-sm text-zinc-400 select-none">.{SUBDOMAIN_ROOT}</span>
          </div>
          {error && <p className="text-xs text-red-600 px-1">{error}</p>}
          <button
            type="submit"
            disabled={!valid || creating}
            className="w-full py-2.5 text-sm font-medium rounded-lg bg-zinc-900 text-white hover:bg-zinc-700 disabled:opacity-40 transition-colors"
          >
            {creating ? 'Creating…' : 'Create site →'}
          </button>
        </form>

        <Link to="/setup" className="block text-center text-sm text-zinc-400 hover:text-zinc-700">
          ← Back
        </Link>
      </div>
    </div>
  )
}

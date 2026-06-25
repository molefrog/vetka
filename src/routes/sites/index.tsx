import { createFileRoute, useRouter, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { getAuthSession, getUserSites, getTangledIdentity } from '../../lib/session-fns'

export const Route = createFileRoute('/sites/')({ component: SitesPage })

type Site = {
  id: string
  domain: string
  isTangled: boolean
  status: string
}

function SitesPage() {
  const router = useRouter()
  const [sites, setSites] = useState<Site[]>([])
  const [setupPath, setSetupPath] = useState<'/setup/tangled' | '/setup/script'>('/setup/script')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const session = await getAuthSession()
      if (!session?.user) { router.navigate({ to: '/' }); return }
      const [s, tangled] = await Promise.all([getUserSites(), getTangledIdentity()])
      setSites(s as Site[])
      setSetupPath(tangled ? '/setup/tangled' : '/setup/script')
      setLoading(false)
    }
    load()
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-zinc-400">Loading…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-4 py-10">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Your sites</h1>
          <Link to="/" className="text-sm text-zinc-400 hover:text-zinc-700">← Home</Link>
        </div>

        {sites.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-zinc-400">No sites yet.</p>
            <Link
              to={setupPath}
              className="inline-block text-sm border border-black px-3 py-1.5 hover:bg-zinc-50"
            >
              Set up your site →
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {sites.map((s) => (
              <div key={s.id} className="flex items-center justify-between border border-zinc-200 px-4 py-3">
                <div>
                  <div className="text-sm font-medium">{s.domain}</div>
                  <div className="text-xs text-zinc-400 mt-0.5">
                    {s.isTangled ? 'Tangled' : 'External'} · {s.status}
                  </div>
                </div>
                <Link
                  to="/sites/$domain/builder"
                  params={{ domain: s.domain }}
                  className="text-xs border border-zinc-200 px-2 py-1 hover:border-black"
                >
                  Builder →
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

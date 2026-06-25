import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { getAuthSession, getUserSites, getTangledIdentity } from '../../lib/session-fns'

export const Route = createFileRoute('/sites/')({
  beforeLoad: async () => {
    const session = await getAuthSession()
    if (!session?.user) throw redirect({ to: '/' })
  },
  loader: async () => {
    const [sites, tangled] = await Promise.all([getUserSites(), getTangledIdentity()])
    return { sites, setupPath: tangled ? '/setup/tangled' : '/setup/script' } as const
  },
  component: SitesPage,
})

function SitesPage() {
  const { sites, setupPath } = Route.useLoaderData()

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
                    {s.isTangled && s.repoName ? (
                      <a
                        href={`https://tangled.org/${s.domain}/${s.repoName}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-zinc-700 underline underline-offset-2"
                      >
                        tangled.org/{s.domain}/{s.repoName}
                      </a>
                    ) : (
                      <a href={`https://${s.domain}`} target="_blank" rel="noopener noreferrer" className="hover:text-zinc-700 underline underline-offset-2">
                        {s.domain}
                      </a>
                    )}
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

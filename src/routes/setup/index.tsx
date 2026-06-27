import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { getAuthSession } from '../../lib/session-fns'
import { VetkaLogo } from '../../components/VetkaLogo'

export const Route = createFileRoute('/setup/')({
  beforeLoad: async () => {
    const session = await getAuthSession()
    if (!session?.user) throw redirect({ to: '/' })
  },
  component: SetupChoicePage,
})

function SetupChoicePage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-1">
          <div className="flex justify-center">
            <VetkaLogo size={28} />
          </div>
          <h1 className="font-display text-xl">How do you want to start?</h1>
          <p className="text-sm text-zinc-500">Connect a site you already have, or let us build you one.</p>
        </div>

        <div className="grid gap-3">
          <Link
            to="/setup/script"
            className="group rounded-2xl border border-black/[0.08] p-5 hover:border-black/30 transition-colors"
          >
            <div className="font-medium">Connect an existing website</div>
            <p className="mt-1 text-sm text-zinc-500">
              Add a small <code className="bg-zinc-100 px-1 rounded">&lt;script&gt;</code> tag to your own site to
              join the social layer.
            </p>
            <div className="mt-3 text-sm text-zinc-400 group-hover:text-zinc-700">Use my domain →</div>
          </Link>

          <Link
            to="/setup/generate"
            className="group rounded-2xl border border-black/[0.08] p-5 hover:border-black/30 transition-colors"
          >
            <div className="font-medium">Generate a new site</div>
            <p className="mt-1 text-sm text-zinc-500">
              Pick a free <code className="bg-zinc-100 px-1 rounded">name.web.sh</code> address and build it with
              the AI agent — no code or hosting required.
            </p>
            <div className="mt-3 text-sm text-zinc-400 group-hover:text-zinc-700">Create on web.sh →</div>
          </Link>
        </div>

        <Link to="/" className="block text-center text-sm text-zinc-400 hover:text-zinc-700">
          Skip for now
        </Link>
      </div>
    </div>
  )
}

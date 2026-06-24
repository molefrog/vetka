import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { finalizeAuthorization } from '@atcute/oauth-browser-client'
import { ensureOAuthConfigured } from '../lib/oauth'
import { createTangledSession } from '../lib/session-fns'

export const Route = createFileRoute('/callback')({ component: CallbackPage })

function CallbackPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function finalize() {
      try {
        ensureOAuthConfigured()
        // atcute requests response_mode=fragment, so params arrive in the hash
        const raw = window.location.hash.startsWith('#')
          ? window.location.hash.slice(1)
          : window.location.search
        const params = new URLSearchParams(raw)
        const { session } = await finalizeAuthorization(params)

        // Create server-side session for this Tangled identity
        const did = session.info.sub
        await createTangledSession({ data: { did, handle: did } })

        router.navigate({ to: '/select-repo' })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Authorization failed')
      }
    }
    finalize()
  }, [router])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-4">
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </p>
          <a href="/" className="block text-sm text-zinc-500 hover:text-zinc-900 transition-colors">
            ← Back to login
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-sm text-zinc-400">Completing sign in…</p>
    </div>
  )
}

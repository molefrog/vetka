import { createFileRoute } from '@tanstack/react-router'
import { auth } from '../../../lib/auth.server'

// Allow any origin since Notch embeds on arbitrary third-party sites.
// Credentials mode requires us to reflect the specific origin (not *).
function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get('Origin') ?? ''
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  }
}

export const Route = createFileRoute('/api/notch/me')({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        return new Response(null, { status: 204, headers: corsHeaders(request) })
      },

      GET: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers })

        const body = session?.user
          ? { user: { name: session.user.name, email: session.user.email } }
          : { user: null }

        return Response.json(body, { headers: corsHeaders(request) })
      },
    },
  },
})

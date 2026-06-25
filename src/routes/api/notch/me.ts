import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { auth } from '../../../lib/auth.server'
import { db } from '../../../db'
import { tangledIdentity, site } from '../../../db/schema'

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
        if (!session?.user) return Response.json({ user: null }, { headers: corsHeaders(request) })

        const userId = session.user.id

        // Fetch Tangled handle and viewer's own site domain in parallel.
        const [identityRows, siteRows] = await Promise.all([
          db.select({ handle: tangledIdentity.handle })
            .from(tangledIdentity)
            .where(eq(tangledIdentity.userId, userId))
            .limit(1),
          db.select({ domain: site.domain })
            .from(site)
            .where(eq(site.userId, userId))
            .limit(1),
        ])

        const handle = identityRows[0]?.handle ?? null
        const domain = siteRows[0]?.domain ?? null

        return Response.json(
          {
            user: {
              name: session.user.name,
              email: session.user.email,
              image: session.user.image ?? null,
              handle,
              domain,
            },
          },
          { headers: corsHeaders(request) },
        )
      },
    },
  },
})

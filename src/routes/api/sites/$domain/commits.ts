import { createFileRoute } from '@tanstack/react-router'
import { auth } from '../../../../lib/auth.server'
import { db } from '../../../../db'
import { site } from '../../../../db/schema'
import { eq } from 'drizzle-orm'

export const Route = createFileRoute('/api/sites/$domain/commits')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const session = await auth.api.getSession({ headers: request.headers })
        if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        const [siteRow] = await db
          .select()
          .from(site)
          .where(eq(site.domain, params.domain))
          .limit(1)

        if (!siteRow?.isTangled || !siteRow.repoName || !siteRow.repoKnot) {
          return Response.json({ commits: [] })
        }

        const knot = siteRow.repoKnot
        const owner = siteRow.domain // Tangled handle == site domain
        const repo = siteRow.repoName

        const url = `https://${knot}/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?limit=50`

        try {
          const res = await fetch(url, { headers: { Accept: 'application/json' } })
          if (!res.ok) {
            return Response.json({ commits: [], error: `API ${res.status}` })
          }
          const data = await res.json()
          return Response.json({ commits: Array.isArray(data) ? data : [] })
        } catch (err) {
          return Response.json({ commits: [], error: String(err) }, { status: 502 })
        }
      },
    },
  },
})

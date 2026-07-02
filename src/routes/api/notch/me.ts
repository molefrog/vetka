import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { auth } from '../../../lib/auth.server'
import { db } from '../../../db'
import { site } from '../../../db/schema'
import { corsJson, corsOptions } from '../../../lib/notch-social'

export const Route = createFileRoute('/api/notch/me')({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => corsOptions(request),

      GET: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers })
        if (!session?.user) return corsJson(request, { user: null })

        const userId = session.user.id

        const [siteRow] = await db
          .select({ domain: site.domain })
          .from(site)
          .where(eq(site.userId, userId))
          .limit(1)

        const domain = siteRow?.domain ?? null
        // Handle is derived from the site domain's first label (e.g. "maya").
        const handle = domain ? `@${domain.replace(/^https?:\/\//, '').split('.')[0]}` : null

        // email is intentionally omitted — this response is readable cross-origin
        // by the Notch widget, which only needs display fields.
        return corsJson(request, {
          user: {
            name: session.user.name,
            image: session.user.image ?? null,
            handle,
            domain,
          },
        })
      },
    },
  },
})

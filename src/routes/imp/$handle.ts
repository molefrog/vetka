import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'

export const Route = createFileRoute('/imp/$handle')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (import.meta.env.PROD) {
          return new Response('Not found', { status: 404 })
        }

        const { db } = await import('../../db')
        const { user, tangledIdentity } = await import('../../db/schema')

        const [found] = await db
          .select({ id: user.id, did: tangledIdentity.did, handle: tangledIdentity.handle })
          .from(user)
          .innerJoin(tangledIdentity, eq(tangledIdentity.userId, user.id))
          .where(eq(tangledIdentity.handle, params.handle))

        if (!found) {
          return new Response(`No user with handle "${params.handle}"`, { status: 404 })
        }

        // Call the existing signInTangled BetterAuth endpoint — it sets the cookie correctly
        const { auth } = await import('../../lib/auth.server')
        const origin = new URL(request.url).origin
        const signInRes = await auth.handler(
          new Request(`${origin}/api/auth/sign-in/tangled`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ did: found.did, handle: found.handle }),
          }),
        )

        const to = new URL(request.url).searchParams.get('to') ?? '/'
        return new Response(null, {
          status: 302,
          headers: {
            Location: to,
            'Set-Cookie': signInRes.headers.get('set-cookie') ?? '',
          },
        })
      },
    },
  },
})

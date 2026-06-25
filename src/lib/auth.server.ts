import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { setSessionCookie } from 'better-auth/cookies'
import { createAuthEndpoint } from '@better-auth/core/api'
import { APIError } from 'better-auth'
import { db } from '../db'
import * as schema from '../db/schema'
import { eq } from 'drizzle-orm'
import * as z from 'zod'

function tangledPlugin() {
  return {
    id: 'tangled',
    endpoints: {
      signInTangled: createAuthEndpoint(
        '/sign-in/tangled',
        {
          method: 'POST',
          body: z.object({ did: z.string().min(1), handle: z.string().min(1) }),
          requireRequest: true,
        },
        async (ctx) => {
          const { did, handle } = ctx.body

          // Synthetic email: replace non-alphanumeric chars so it looks like a valid email
          const emailLocal = did.replace(/[^a-zA-Z0-9]/g, '-')
          const syntheticEmail = `${emailLocal}@tangled.atproto.com`

          // Find existing account for this DID
          const existingAccount = await ctx.context.adapter.findOne<{
            userId: string
          }>({
            model: 'account',
            where: [
              { field: 'providerId', value: 'tangled' },
              { field: 'accountId', value: did },
            ],
          })

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let user: any

          if (existingAccount) {
            user = await ctx.context.adapter.findOne({
              model: 'user',
              where: [{ field: 'id', value: existingAccount.userId }],
            })
            if (!user)
              throw new APIError('INTERNAL_SERVER_ERROR', {
                message: 'User not found',
              })
          } else {
            user = await ctx.context.internalAdapter.createUser({
              name: handle,
              email: syntheticEmail,
              emailVerified: false,
            })
            await ctx.context.internalAdapter.createAccount({
              userId: user.id,
              providerId: 'tangled',
              accountId: did,
            })
            // Link tangledIdentity to this better-auth user
            await db
              .update(schema.tangledIdentity)
              .set({ userId: user.id, handle, updatedAt: new Date() })
              .where(eq(schema.tangledIdentity.did, did))
          }

          const session = await ctx.context.internalAdapter.createSession(user.id)
          if (!session)
            throw new APIError('INTERNAL_SERVER_ERROR', { message: 'Failed to create session' })

          await setSessionCookie(ctx, { session, user })

          return ctx.json({ userId: user.id, did })
        },
      ),
    },
  }
}

const isProd = process.env.NODE_ENV === 'production'

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.VITE_APP_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  // Notch embeds on third-party sites and calls /api/notch/* with credentials.
  // SameSite=None;Secure is required for cookies to be sent cross-site.
  advanced: isProd ? { cookieOptions: { sameSite: 'none', secure: true } } : {},
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: { enabled: true, minPasswordLength: 6 },
  ...(process.env.GOOGLE_CLIENT_ID
    ? {
        socialProviders: {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          },
        },
      }
    : {}),
  trustedOrigins: [
    'https://neko.puma-scylla.ts.net',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ],
  plugins: [tanstackStartCookies(), tangledPlugin()],
})

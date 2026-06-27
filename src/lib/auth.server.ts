import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { emailOTP } from 'better-auth/plugins'
import { db } from '../db'
import * as schema from '../db/schema'
import { sendOtpEmail } from './email.server'

const isLocalDev = process.env.NODE_ENV !== 'production' && !process.env.BETTER_AUTH_URL?.startsWith('https')

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.VITE_APP_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  // Notch embeds on third-party sites and calls /api/notch/* with credentials.
  // SameSite=None;Secure is required for cookies to be sent cross-site, and
  // Partitioned (CHIPS) is required for them to survive third-party-cookie
  // blocking (Chrome's phase-out, Safari ITP) — without it the widget falls back
  // to anonymous on those browsers. Only skip it for plain http localhost where
  // Secure cookies don't work.
  advanced: isLocalDev
    ? { disableCSRFCheck: true }
    : { defaultCookieAttributes: { sameSite: 'none', secure: true, partitioned: true } },
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  // Passwordless: users sign in with email + a one-time code, or with Google.
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
    'https://vetka.sh',
    'https://www.vetka.sh',
    'https://neko.puma-scylla.ts.net',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ],
  plugins: [
    tanstackStartCookies(),
    emailOTP({
      // Allow account creation on first sign-in so email OTP doubles as sign-up.
      disableSignUp: false,
      otpLength: 6,
      expiresIn: 5 * 60,
      async sendVerificationOTP({ email, otp }) {
        await sendOtpEmail(email, otp)
      },
    }),
  ],
})

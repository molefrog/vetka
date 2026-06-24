import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({
  baseURL: typeof window !== 'undefined'
    ? window.location.origin
    : (import.meta.env.VITE_APP_URL ?? 'http://127.0.0.1:3000'),
})

export const { useSession, signIn, signOut, signUp } = authClient

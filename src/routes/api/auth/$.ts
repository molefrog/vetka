import { createFileRoute } from '@tanstack/react-router'
import { auth } from '../../../lib/auth.server'

// Catch-all handler for all BetterAuth routes (/api/auth/*).
// In dev this is also handled by the Vite middleware in vite.config.ts,
// but this file is what makes it work in production (Vercel).
export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }) => auth.handler(request),
      POST: ({ request }) => auth.handler(request),
    },
  },
})

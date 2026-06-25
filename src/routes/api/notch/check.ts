import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/notch/check')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const domain = new URL(request.url).searchParams.get('domain') ?? ''
        if (!domain) return Response.json({ found: false })

        try {
          const url = `https://${domain}`
          const res = await fetch(url, {
            signal: AbortSignal.timeout(5000),
            headers: { 'User-Agent': 'Vetka-Bot/1.0' },
          })
          const html = await res.text()
          const found = html.includes('notch.js')
          return Response.json({ found })
        } catch {
          return Response.json({ found: false })
        }
      },
    },
  },
})

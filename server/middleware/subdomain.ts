import { defineEventHandler, getHeader } from 'h3'

const SUBDOMAIN_ROOT = process.env.VITE_SUBDOMAIN_ROOT ?? 'web.sh'

// H3 v2 web mode (Vercel preset) creates Web-native events — event.node is
// undefined and event.path is a read-only getter (strict-mode ES module: you
// cannot assign to it). TanStack Start also routes on the original request.url,
// not event.url, so rewriting the H3 event URL doesn't change how TanStack
// Start dispatches. The only reliable intercept is to serve directly from the
// middleware, returning a Response before TanStack Start ever sees the request.
export default defineEventHandler(async (event) => {
  const path = event.url.pathname

  // Skip API routes — let them reach TanStack Start normally.
  if (path.startsWith('/api/')) return

  const host = getHeader(event, 'x-forwarded-host') ?? getHeader(event, 'host') ?? ''
  const suffix = `.${SUBDOMAIN_ROOT}`
  if (!host.endsWith(suffix)) return

  const label = host.slice(0, -suffix.length)
  if (!label || label.includes('.')) return

  const [{ db }, { site }, { getStorage, storageKeys, contentTypeFor }, { eq }] = await Promise.all([
    import('../../src/db'),
    import('../../src/db/schema'),
    import('../../src/lib/storage.server'),
    import('drizzle-orm'),
  ])

  const [siteRow] = await db
    .select({ id: site.id })
    .from(site)
    .where(eq(site.subdomain, label))
    .limit(1)
  if (!siteRow) return new Response('Site not found', { status: 404 })

  const storage = getStorage()
  const livePrefix = storageKeys.live(siteRow.id)

  let filePath = path.replace(/^\/+/, '')
  if (filePath === '' || filePath.endsWith('/')) filePath += 'index.html'

  let obj = await storage.get(livePrefix + filePath)

  if (!obj && !filePath.split('/').pop()!.includes('.')) {
    obj = await storage.get(livePrefix + 'index.html')
  }
  if (!obj) return new Response('Not found', { status: 404 })

  return new Response(obj.body as BodyInit, {
    headers: {
      'Content-Type': obj.contentType || contentTypeFor(filePath),
      'Cache-Control': filePath.endsWith('index.html')
        ? 'public, max-age=0, must-revalidate'
        : 'public, max-age=3600',
    },
  })
})

import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { db } from '../../../db'
import { site } from '../../../db/schema'
import { getStorage, storageKeys, contentTypeFor } from '../../../lib/storage.server'

// Static file serving for generated sites hosted on the wildcard subdomain
// (e.g. *.web.sh). The reverse proxy that fronts the subdomain forwards the
// request here preserving the original Host header (and may also pass the
// resolved label via X-Vetka-Subdomain). We map host → site → storage and
// stream the file from the site's live prefix.
//
// SPA fallback: a request with no matching file and no extension serves
// index.html so client-routed sites work.

const SUBDOMAIN_ROOT = process.env.VITE_SUBDOMAIN_ROOT ?? 'web.sh'

function subdomainFromHost(host: string | null): string | null {
  if (!host) return null
  const h = host.split(':')[0].toLowerCase()
  const suffix = `.${SUBDOMAIN_ROOT}`
  if (!h.endsWith(suffix)) return null
  const label = h.slice(0, -suffix.length)
  // Only the left-most label (no nested subdomains).
  return label && !label.includes('.') ? label : null
}

async function serve(request: Request, splat: string | undefined): Promise<Response> {
  const url = new URL(request.url)
  // _sub is injected by the vercel.json rewrite from the wildcard host capture group
  // so the serve function gets the subdomain even if Vercel normalizes the Host header.
  const subFromQuery = url.searchParams.get('_sub')
  const sub =
    request.headers.get('X-Vetka-Subdomain') ??
    subFromQuery ??
    subdomainFromHost(request.headers.get('host'))
  if (!sub) return new Response('Not found', { status: 404 })

  const [siteRow] = await db
    .select({ id: site.id, status: site.status })
    .from(site)
    .where(eq(site.subdomain, sub))
    .limit(1)
  if (!siteRow) return new Response('Site not found', { status: 404 })

  const storage = getStorage()
  const livePrefix = storageKeys.live(siteRow.id)

  let path = (splat ?? '').replace(/^\/+/, '')
  if (path === '' || path.endsWith('/')) path += 'index.html'

  let obj = await storage.get(livePrefix + path)

  // SPA fallback for extension-less routes.
  if (!obj && !path.split('/').pop()!.includes('.')) {
    obj = await storage.get(livePrefix + 'index.html')
  }
  if (!obj) return new Response('Not found', { status: 404 })

  return new Response(obj.body as BodyInit, {
    headers: {
      'Content-Type': obj.contentType || contentTypeFor(path),
      'Cache-Control': path.endsWith('index.html') ? 'public, max-age=0, must-revalidate' : 'public, max-age=3600',
    },
  })
}

export const Route = createFileRoute('/api/serve/$')({
  server: {
    handlers: {
      GET: async ({ request, params }) => serve(request, (params as { _splat?: string })._splat),
      HEAD: async ({ request, params }) => serve(request, (params as { _splat?: string })._splat),
    },
  },
})

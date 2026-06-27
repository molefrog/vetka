const APP_URL = process.env.VITE_APP_URL ?? 'https://vetka.sh'
const NOTCH_SNIPPET = `<script type="module" src="${APP_URL}/notch.js"></script>`

export function injectNotch(html: string): string {
  if (html.includes('notch.js')) return html
  const idx = html.lastIndexOf('</body>')
  return idx !== -1
    ? html.slice(0, idx) + NOTCH_SNIPPET + html.slice(idx)
    : html + NOTCH_SNIPPET
}

// Hashed assets (bun/vite output like `index-Hjll_cGy.js`) are immutable —
// their URL changes on every rebuild, so they're safe to cache at the edge for
// a year. Unhashed files get a 1-hour edge TTL so a re-deploy with the same
// filename propagates within an hour. HTML uses stale-while-revalidate so the
// first visitor after a deploy still gets a fast response while cache warms up.
export function cacheControl(filePath: string): string {
  if (filePath.endsWith('.html')) {
    return 'public, max-age=0, s-maxage=60, stale-while-revalidate=86400'
  }
  // Content-hashed filename: name-XXXXXXXX.ext with 8+ alphanumeric chars
  if (/[.-][a-zA-Z0-9_-]{8,}\.[a-z0-9]+$/.test(filePath)) {
    return 'public, max-age=31536000, s-maxage=31536000, immutable'
  }
  // Unhashed filename — no caching at all so re-deploys with the same
  // filename are immediately visible everywhere.
  return 'no-store'
}

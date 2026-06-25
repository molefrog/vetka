// Follows data — talks to the Notch social API (src/routes/api/notch/follows).
// Avatars fall back to deterministic facehash faces seeded by `seed` when a
// real `image` isn't present.

export type Follow = {
  id: string // site id — the canonical follow target
  name: string
  seed: string // facehash seed (the followee's domain)
  handle: string // "@handle" — shown as the secondary line
  bio?: string
  image?: string | null
  following: boolean // whether the viewer currently follows them
}

export const followingCount = (list: Follow[]) => list.filter((f) => f.following).length

// Load the follows of a given site (`of`). Omitting `of` defaults server-side
// to the viewer's own site. Returns [] when logged out or on error.
export async function loadFollows(apiBase: string, of?: string): Promise<Follow[]> {
  const q = of ? `?of=${encodeURIComponent(of)}` : ''
  try {
    const r = await fetch(`${apiBase}/api/notch/follows${q}`, { credentials: 'include' })
    if (!r.ok) return []
    const d = await r.json()
    return (d.follows ?? []) as Follow[]
  } catch {
    return []
  }
}

// Follow (on=true) or unfollow (on=false) a site. Returns whether it persisted.
//
// The widget runs cross-origin on third-party host pages, so this is a
// credentialed cross-site request. We deliberately keep it a CORS "simple"
// request — POST with a safelisted `text/plain` Content-Type and no custom
// headers — so the browser sends it WITHOUT a preflight. (Preflight OPTIONS is
// answered by a generic framework handler that omits Access-Control-Allow-Origin/
// -Credentials, which would otherwise block any application/json POST or DELETE.)
// Follow and unfollow are both POSTs (DELETE is never "simple"); `on` picks which.
export async function setFollow(
  apiBase: string,
  followeeId: string,
  on: boolean,
): Promise<boolean> {
  try {
    const r = await fetch(`${apiBase}/api/notch/follows`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ followeeId, on }),
    })
    return r.ok
  } catch {
    return false
  }
}

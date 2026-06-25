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
export async function setFollow(
  apiBase: string,
  followeeId: string,
  on: boolean,
): Promise<boolean> {
  try {
    if (on) {
      const r = await fetch(`${apiBase}/api/notch/follows`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followeeId }),
      })
      return r.ok
    }
    const r = await fetch(
      `${apiBase}/api/notch/follows?followeeId=${encodeURIComponent(followeeId)}`,
      { method: 'DELETE', credentials: 'include' },
    )
    return r.ok
  } catch {
    return false
  }
}

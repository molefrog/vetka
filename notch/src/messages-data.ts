// Messages data — talks to the Notch social API (src/routes/api/notch/
// conversations*). Avatars fall back to deterministic facehash faces seeded by
// `seed` when a real `image` isn't present.

export type ChatMessage = {
  id: string
  fromMe: boolean
  text: string
  createdAt?: string
}

// A row in the conversation list (no thread — that loads on open).
export type Conversation = {
  id: string // peer site id
  name: string
  seed: string // facehash seed (peer domain)
  image?: string | null
  handle?: string
  preview: string // last-message preview line
  time: string // "1h" | "2d" | "now"
  status?: string // optional presence line shown in place of `preview`
  unread?: boolean // blue unread dot
}

export const unreadCount = (list: Conversation[]) => list.filter((c) => c.unread).length

// The viewer's conversation list. Returns [] when logged out / no site.
export async function loadConversations(apiBase: string): Promise<Conversation[]> {
  try {
    const r = await fetch(`${apiBase}/api/notch/conversations`, { credentials: 'include' })
    if (!r.ok) return []
    const d = await r.json()
    return (d.conversations ?? []) as Conversation[]
  } catch {
    return []
  }
}

// The viewer's unread-conversation count, for the Messages icon badge. Returns 0
// when logged out / no site, or on any error.
export async function loadUnreadCount(apiBase: string): Promise<number> {
  try {
    const r = await fetch(`${apiBase}/api/notch/conversations`, { credentials: 'include' })
    if (!r.ok) return 0
    const d = await r.json()
    return (d.unreadCount ?? 0) as number
  } catch {
    return 0
  }
}

// The full thread with one peer (also marks inbound messages read server-side).
export async function loadThread(apiBase: string, peerId: string): Promise<ChatMessage[]> {
  try {
    const r = await fetch(`${apiBase}/api/notch/conversations/${encodeURIComponent(peerId)}`, {
      credentials: 'include',
    })
    if (!r.ok) return []
    const d = await r.json()
    return (d.messages ?? []) as ChatMessage[]
  } catch {
    return []
  }
}

// Send a message to a peer; returns the created message or null on failure.
//
// Cross-origin from third-party host pages, so this is kept a CORS "simple"
// request — POST with a safelisted `text/plain` Content-Type and no custom
// headers — so the browser sends it WITHOUT a preflight. (The OPTIONS preflight
// is answered by a generic framework handler that omits the credentialed CORS
// headers, which would otherwise block an application/json POST.) Body is JSON.
export async function sendMessage(
  apiBase: string,
  peerId: string,
  text: string,
): Promise<ChatMessage | null> {
  try {
    const r = await fetch(
      `${apiBase}/api/notch/conversations/${encodeURIComponent(peerId)}/messages`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ text }),
      },
    )
    if (!r.ok) return null
    return (await r.json()) as ChatMessage
  } catch {
    return null
  }
}

import { useEffect, useState } from 'react'
import {
  PANEL,
  panelContainerStyle,
  HeaderBtn,
  PanelRow,
  IconClose,
} from './panel-kit'
import { loadFollows, setFollow, followingCount, type Follow } from './follows-data'
import type { NotchMode } from './Widget'

type Peer = { name: string; seed: string; src?: string }

interface Props {
  mode: NotchMode
  owner: Peer
  apiBase: string
  // The site whose follows to show: the host owner's site (anonymous mode) or
  // the viewer's own site (visitor mode). Undefined ⇒ server defaults to viewer.
  of?: string | null
  onClose: () => void
}

// The Follows popup — a list of accounts a site follows. Built from the shared
// panel-kit so it stays visually consistent with the Messages popup.
export function FollowsPanel({ apiBase, of, onClose }: Props) {
  const [follows, setFollows] = useState<Follow[]>([])

  useEffect(() => {
    let alive = true
    loadFollows(apiBase, of ?? undefined).then((f) => {
      if (alive) setFollows(f)
    })
    return () => {
      alive = false
    }
  }, [apiBase, of])

  const count = followingCount(follows)

  return (
    <div style={panelContainerStyle} onMouseDown={(e) => e.stopPropagation()}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '14px 14px 12px 18px',
          borderBottom: `1px solid ${PANEL.divider}`,
        }}
      >
        <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.01em' }}>
          Follows
        </span>
        {count > 0 && (
          <span
            style={{
              minWidth: 22,
              height: 22,
              padding: '0 6px',
              borderRadius: 999,
              background: 'rgba(255,255,255,.14)',
              color: PANEL.ink,
              fontSize: 12,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {count}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <HeaderBtn onClick={onClose} title="Close">
          <IconClose />
        </HeaderBtn>
      </div>

      {/* Scrollable list */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '6px 0' }}>
        {follows.map((f) => (
          <FollowRow key={f.id} follow={f} apiBase={apiBase} />
        ))}
      </div>
    </div>
  )
}

// A follows list row: shared PanelRow with a Follow/Following toggle trailing.
// The toggle optimistically flips, then persists via the API (reverting on
// failure).
function FollowRow({ follow, apiBase }: { follow: Follow; apiBase: string }) {
  const [following, setFollowing] = useState(follow.following)
  const [pending, setPending] = useState(false)

  const toggle = async () => {
    if (pending) return
    const next = !following
    setFollowing(next)
    setPending(true)
    const ok = await setFollow(apiBase, follow.id, next)
    if (!ok) setFollowing(!next) // revert on failure
    setPending(false)
  }

  return (
    <PanelRow
      name={follow.name}
      seed={follow.seed}
      src={follow.image ?? undefined}
      subtitle={follow.bio ?? follow.handle}
      trailing={<FollowButton following={following} onClick={toggle} />}
    />
  )
}

function FollowButton({
  following,
  onClick,
}: {
  following: boolean
  onClick: () => void
}) {
  const [hover, setHover] = useState(false)
  return (
    <span
      role="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 84,
        height: 30,
        padding: '0 14px',
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 700,
        cursor: 'pointer',
        userSelect: 'none',
        transition: 'background .15s ease, opacity .15s ease',
        ...(following
          ? {
              background: 'transparent',
              color: PANEL.ink,
              border: PANEL.border,
              opacity: hover ? 0.7 : 1,
            }
          : {
              background: PANEL.accent,
              color: PANEL.onAccent,
              border: '1px solid transparent',
              opacity: hover ? 0.9 : 1,
            }),
      }}
    >
      {following ? 'Following' : 'Follow'}
    </span>
  )
}

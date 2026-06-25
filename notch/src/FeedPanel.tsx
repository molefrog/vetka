import { useEffect, useState } from 'react'
import { Avatar } from './Avatar'
import { PANEL, panelContainerStyle, HeaderBtn, IconClose } from './panel-kit'

// The global feed — mirrors the "Global feed" column on the vetka home page
// (src/routes/index.tsx). Both read GET /api/feed: live sites that have a page
// snapshot, most-recently-updated first. We fetch cross-origin from the vetka
// origin (the endpoint sets CORS for the widget) and render compact rows on the
// shared frost panel. The home page additionally shows each site's snapshot
// image; we keep the widget light and omit it.
interface FeedUpdate {
  name: string
  domain: string
  action: string
  time: string
}

export function FeedPanel({ apiBase, onClose }: { apiBase: string; onClose: () => void }) {
  const [feed, setFeed] = useState<FeedUpdate[] | null>(null)

  useEffect(() => {
    let alive = true
    fetch(`${apiBase}/api/feed`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => alive && setFeed((d.items ?? []) as FeedUpdate[]))
      .catch(() => alive && setFeed([]))
    return () => {
      alive = false
    }
  }, [apiBase])

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
          Global feed
        </span>
        <div style={{ flex: 1 }} />
        <HeaderBtn onClick={onClose} title="Close">
          <IconClose />
        </HeaderBtn>
      </div>

      {/* Scrollable list */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '6px 0' }}>
        {feed === null ? (
          <div style={{ padding: '24px 18px', color: PANEL.muted, fontSize: 13.5 }}>
            Loading feed…
          </div>
        ) : feed.length === 0 ? (
          <div style={{ padding: '24px 18px', color: PANEL.muted, fontSize: 13.5 }}>
            No updates yet.
          </div>
        ) : (
          feed.map((item, idx) => (
            <div
              key={item.domain + idx}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 18px' }}
            >
              <Avatar seed={item.name} size={40} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 6,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                  }}
                >
                  <span
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {item.name}
                  </span>
                  <span style={{ fontSize: 13, color: PANEL.muted, flex: '0 1 auto', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.domain}
                  </span>
                  <span style={{ marginLeft: 'auto', paddingLeft: 8, flex: '0 0 auto', fontSize: 12, color: PANEL.muted }}>
                    {item.time}
                  </span>
                </div>
                <div style={{ fontSize: 13.5, marginTop: 2, color: PANEL.muted }}>
                  {item.action}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

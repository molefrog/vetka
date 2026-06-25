import { useState, useEffect, useMemo, useRef, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { db } from './instant'
import type { Signal } from './reactions-data'

interface Props {
  domain: string
  pageUrl: string
  reactMode: boolean
  pickedSignal: Signal | null
  apiBase: string
  onPlace: (x: number, y: number) => void
}

interface StampPos {
  left: number
  top: number
}

function computePos(xPct: number, yPct: number): StampPos {
  const sw = document.documentElement.scrollWidth
  const sh = document.documentElement.scrollHeight
  return {
    left: (xPct / 100) * sw - window.scrollX,
    top: (yPct / 100) * sh - window.scrollY,
  }
}

function Tooltip({ name }: { name: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 6px)',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(10,10,14,.88)',
        color: '#fff',
        fontSize: 12,
        fontWeight: 600,
        lineHeight: 1,
        padding: '5px 9px',
        borderRadius: 8,
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
        fontFamily: "'Manrope', system-ui, sans-serif",
        boxShadow: '0 4px 12px rgba(0,0,0,.28)',
      }}
    >
      {name}
    </div>
  )
}

function Stamp({
  signal,
  tilt,
  authorName,
  xPct,
  yPct,
  apiBase,
  scroll,
}: {
  signal: string
  tilt: number
  authorName: string
  xPct: number
  yPct: number
  apiBase: string
  scroll: { x: number; y: number }
}) {
  const [hovered, setHovered] = useState(false)
  const pos = computePos(xPct, yPct)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        width: 44,
        height: 44,
        transform: `translate(-50%, -50%) rotate(${tilt}deg)`,
        zIndex: 2147483640,
        cursor: 'default',
        pointerEvents: 'all',
      }}
    >
      {/* White chip */}
      <div
        style={{
          width: 44,
          height: 44,
          background: '#fff',
          borderRadius: 13,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 3px 9px rgba(40,35,25,.22)',
          position: 'relative',
        }}
      >
        <img
          src={`${apiBase}/reactions/${signal}.svg`}
          alt={signal}
          style={{ width: '60%', height: '60%', display: 'block' }}
          draggable={false}
        />
        {hovered && <Tooltip name={authorName} />}
      </div>
    </div>
  )
}

export function ReactionsOverlay({ domain, pageUrl, reactMode, pickedSignal, apiBase, onPlace }: Props) {
  const [scroll, setScroll] = useState({ x: window.scrollX, y: window.scrollY })

  const { data } = db.useQuery({
    reactions: {
      $: { where: { domain } },
    },
  })

  useEffect(() => {
    const onScroll = () => setScroll({ x: window.scrollX, y: window.scrollY })
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const overlayEl = useMemo(() => {
    const el = document.createElement('div')
    el.id = 'notch-overlay'
    document.body.appendChild(el)
    return el
  }, [])

  useEffect(() => () => overlayEl.remove(), [overlayEl])

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!reactMode) return
    const sw = document.documentElement.scrollWidth
    const sh = document.documentElement.scrollHeight
    const xPct = ((e.clientX + window.scrollX) / sw) * 100
    const yPct = ((e.clientY + window.scrollY) / sh) * 100
    onPlace(xPct, yPct)
  }

  const stamps = data?.reactions?.filter((r) => r.pageUrl === pageUrl) ?? []

  const ghostStyle: CSSProperties = reactMode
    ? {
        position: 'fixed',
        inset: 0,
        zIndex: 2147483639,
        cursor: pickedSignal ? `url("${apiBase}/reactions/${pickedSignal}.svg") 22 22, crosshair` : 'crosshair',
        pointerEvents: 'all',
      }
    : { display: 'none' }

  return createPortal(
    <>
      {/* Click-capture layer — only active in react mode */}
      <div style={ghostStyle} onClick={handleClick} />

      {stamps.map((r) => (
        <Stamp
          key={r.id}
          signal={r.signal}
          tilt={r.tilt}
          authorName={r.authorName}
          xPct={r.x}
          yPct={r.y}
          apiBase={apiBase}
          scroll={scroll}
        />
      ))}
    </>,
    overlayEl,
  )
}

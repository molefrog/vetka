import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'

export function Widget() {
  const [open, setOpen] = useState(false)
  const [clicks, setClicks] = useState(0)
  const [scrollDepth, setScrollDepth] = useState(0)
  const [timeOnPage, setTimeOnPage] = useState(0)
  const startRef = useRef(Date.now())
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClickDoc = (e: MouseEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return
      setClicks((c) => c + 1)
    }

    const onScroll = () => {
      const pct = Math.round(
        ((window.scrollY + window.innerHeight) / document.documentElement.scrollHeight) * 100,
      )
      setScrollDepth((d) => Math.max(d, Math.min(pct, 100)))
    }

    const timer = setInterval(() => {
      setTimeOnPage(Math.floor((Date.now() - startRef.current) / 1000))
    }, 1000)

    document.addEventListener('click', onClickDoc)
    document.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      document.removeEventListener('click', onClickDoc)
      document.removeEventListener('scroll', onScroll)
      clearInterval(timer)
    }
  }, [])

  const formatTime = (s: number) =>
    s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`

  const stats = [
    { label: 'Clicks', value: clicks },
    { label: 'Scroll', value: `${scrollDepth}%` },
    { label: 'Time', value: formatTime(timeOnPage), wide: true },
  ]

  return (
    <div
      ref={rootRef}
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 2147483647,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            style={{ position: 'absolute', bottom: 'calc(100% + 10px)', right: 0, width: 220 }}
            className="notch:bg-zinc-900 notch:rounded-2xl notch:border notch:border-white/10 notch:p-4 notch:shadow-2xl"
          >
            <p className="notch:text-[10px] notch:font-medium notch:uppercase notch:tracking-widest notch:text-white/30 notch:mb-3">
              Live Session
            </p>
            <div className="notch:grid notch:grid-cols-2 notch:gap-2">
              {stats.map(({ label, value, wide }) => (
                <div
                  key={label}
                  className={[
                    'notch:bg-white/5 notch:rounded-xl notch:p-3',
                    wide ? 'notch:col-span-2' : '',
                  ].join(' ')}
                >
                  <div className="notch:text-white notch:text-xl notch:font-semibold notch:leading-none notch:tabular-nums">
                    {value}
                  </div>
                  <div className="notch:text-white/40 notch:text-xs notch:mt-1">{label}</div>
                </div>
              ))}
            </div>
            <div className="notch:mt-3 notch:pt-3 notch:border-t notch:border-white/10 notch:text-center notch:text-xs notch:text-white/20 notch:tracking-wide">
              Notch
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        onClick={() => setOpen((o) => !o)}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        style={{ outline: 'none', border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}
      >
        <div className="notch:flex notch:items-center notch:gap-2 notch:bg-zinc-900 notch:text-white notch:rounded-full notch:px-3.5 notch:py-2 notch:shadow-lg notch:border notch:border-white/10 notch:text-sm notch:font-medium notch:select-none">
          <span className="notch:size-2 notch:rounded-full notch:bg-emerald-400 notch:shrink-0 notch:animate-pulse" />
          Notch
        </div>
      </motion.button>
    </div>
  )
}

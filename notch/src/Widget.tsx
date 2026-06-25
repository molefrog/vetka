import { useState, useEffect } from 'react'

interface User {
  name: string
  email: string
}

interface Props {
  apiBase: string
}

export function Widget({ apiBase }: Props) {
  const [open, setOpen] = useState(false)
  const [user, setUser] = useState<User | null | undefined>(undefined)

  useEffect(() => {
    fetch(`${apiBase}/api/notch/me`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setUser(d.user ?? null))
      .catch(() => setUser(null))
  }, [apiBase])

  const loading = user === undefined
  const loggedIn = !!user

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 2147483647,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Popover panel */}
      <div
        style={{
          position: 'absolute',
          bottom: 'calc(100% + 8px)',
          right: 0,
          width: 200,
          opacity: open ? 1 : 0,
          transform: open ? 'translateY(0) scale(1)' : 'translateY(6px) scale(0.97)',
          transition: 'opacity 0.12s ease, transform 0.12s ease',
          pointerEvents: open ? 'auto' : 'none',
        }}
        className="notch:bg-zinc-900 notch:border notch:border-white/10 notch:shadow-2xl"
      >
        <div className="notch:p-3 notch:border-b notch:border-white/10">
          <p className="notch:text-[10px] notch:uppercase notch:tracking-widest notch:text-white/30 notch:mb-0">
            Notch
          </p>
        </div>

        <div className="notch:p-3">
          {loading ? (
            <p className="notch:text-white/30 notch:text-xs">…</p>
          ) : loggedIn ? (
            <div>
              <p className="notch:text-white/40 notch:text-[10px] notch:uppercase notch:tracking-widest notch:mb-1">
                Signed in as
              </p>
              <p className="notch:text-white notch:text-sm notch:font-medium notch:truncate">
                {user!.name}
              </p>
              <p className="notch:text-white/30 notch:text-xs notch:truncate notch:mt-0.5">
                {user!.email}
              </p>
            </div>
          ) : (
            <div>
              <p className="notch:text-white/40 notch:text-xs notch:mb-2">
                Not signed in
              </p>
              <a
                href={`${apiBase}/`}
                className="notch:block notch:text-center notch:text-xs notch:text-white notch:border notch:border-white/20 notch:px-3 notch:py-1.5 notch:hover:bg-white/10"
                style={{ textDecoration: 'none' }}
              >
                Sign in →
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ outline: 'none', border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}
      >
        <div className="notch:flex notch:items-center notch:gap-2 notch:bg-zinc-900 notch:text-white notch:px-3.5 notch:py-2 notch:shadow-lg notch:border notch:border-white/10 notch:text-sm notch:font-medium notch:select-none notch:transition-opacity notch:hover:opacity-80">
          <span
            className={[
              'notch:size-2 notch:rounded-full notch:shrink-0',
              loading
                ? 'notch:bg-white/20'
                : loggedIn
                  ? 'notch:bg-emerald-400 notch:animate-pulse'
                  : 'notch:bg-white/30',
            ].join(' ')}
          />
          {loading ? '…' : loggedIn ? user!.name.split(' ')[0] : 'Notch'}
        </div>
      </button>
    </div>
  )
}

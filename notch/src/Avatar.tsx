import { useState } from 'react'
import { Facehash } from 'facehash'

const AVATAR_BG = 'rgba(255,255,255,.12)'

// Renders a real photo when `src` loads, otherwise a deterministic facehash
// avatar seeded by `seed` — masked into a circle of `size`px.
export function Avatar({
  src,
  seed,
  size = 40,
}: {
  src?: string
  seed: string
  size?: number
}) {
  const [broken, setBroken] = useState(false)
  const showImg = !!src && !broken
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        overflow: 'hidden',
        flex: '0 0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: AVATAR_BG,
      }}
    >
      {showImg ? (
        <img
          src={src}
          alt=""
          onError={() => setBroken(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <Facehash name={seed} size={size} interactive={false} />
      )}
    </div>
  )
}

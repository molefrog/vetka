// Icon geometry copied verbatim from the locked set in
// local-drafts/design_handoff_vetka_notch/icons/*.svg.
// All icons: 24x24 viewBox, line style, 1.6 stroke, round caps/joins, from currentColor.

export type IconName =
  | 'logo'
  | 'feed'
  | 'messages'
  | 'follow'
  | 'follows'
  | 'react'
  | 'reactions'
  | 'login'
  | 'more'

const PATHS: Record<IconName, React.ReactNode> = {
  // logo.svg — branch mark
  logo: (
    <g>
      <path d="M12 20.5 C 12 15 11.3 10 12 4.6" />
      <path d="M12 12.6 C 10.4 11.7 9.2 10.2 8.6 8.5" />
      <path d="M12 9.4 C 13.5 8.6 14.7 7.4 15.2 5.9" />
      <path d="M12 15.9 C 11 15.5 10.3 14.7 9.9 13.8" />
    </g>
  ),
  // feed-updates.svg — sparkle
  feed: (
    <path d="M12 4 C12.6 8.6 15.4 11.4 20 12 C15.4 12.6 12.6 15.4 12 20 C11.4 15.4 8.6 12.6 4 12 C8.6 11.4 11.4 8.6 12 4 z" />
  ),
  // messages.svg — speech bubble
  messages: (
    <path d="M5 16.5 V8.5 a3 3 0 0 1 3-3 H16 a3 3 0 0 1 3 3 v4.5 a3 3 0 0 1 -3 3 H10 l-5 3.5 z" />
  ),
  // follow.svg — person +
  follow: (
    <g>
      <circle cx="9.5" cy="9" r="3" />
      <path d="M4 19 a5.5 5.5 0 0 1 11 0" />
      <path d="M18 5.8 V10.8" />
      <path d="M15.5 8.3 H20.5" />
    </g>
  ),
  // follows.svg — overlapping pair
  follows: (
    <g>
      <circle cx="9" cy="12" r="4.2" />
      <circle cx="15" cy="12" r="4.2" />
    </g>
  ),
  // react.svg — heart
  react: (
    <path d="M12 20 C12 20 4 14.5 4 9 a4.2 4.2 0 0 1 8 -1.6 a4.2 4.2 0 0 1 8 1.6 c0 5.5-8 11-8 11 z" />
  ),
  // reactions-overlay.svg — layers
  reactions: (
    <g>
      <path d="M12 4 L21 9 L12 14 L3 9 z" />
      <path d="M3.5 14 L12 18.8 L20.5 14" />
    </g>
  ),
  // login.svg — sign-in arrow
  login: (
    <g>
      <path d="M13.5 4.5 H18 a2 2 0 0 1 2 2 V17.5 a2 2 0 0 1 -2 2 H13.5" />
      <path d="M4 12 H14" />
      <path d="M10.5 8.5 L14 12 L10.5 15.5" />
    </g>
  ),
  // more.svg — overflow dots (the only filled glyph)
  more: (
    <g fill="currentColor" stroke="none">
      <circle cx="6" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="18" cy="12" r="1.5" />
    </g>
  ),
}

export function NotchIcon({
  name,
  size = 20,
  weight = 1.6,
}: {
  name: IconName
  size?: number
  weight?: number
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={weight}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'block' }}
    >
      {PATHS[name]}
    </svg>
  )
}

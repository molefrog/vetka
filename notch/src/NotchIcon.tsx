// Icon geometry copied verbatim from local-drafts/NotchIcon.dc.html.
// All icons: 24x24 viewBox, line style, 1.6 stroke, round caps/joins, drawn from currentColor.

export type IconName =
  | 'logo'
  | 'feed'
  | 'messages'
  | 'following'
  | 'stamp'
  | 'more'

const PATHS: Record<IconName, React.ReactNode> = {
  logo: (
    <g>
      <path d="M12 20.5 C 12 15 11.3 10 12 4.6" />
      <path d="M12 12.6 C 10.4 11.7 9.2 10.2 8.6 8.5" />
      <path d="M12 9.4 C 13.5 8.6 14.7 7.4 15.2 5.9" />
      <path d="M12 15.9 C 11 15.5 10.3 14.7 9.9 13.8" />
    </g>
  ),
  feed: (
    <g>
      <rect x="4" y="5" width="16" height="14" rx="2.5" fill="none" />
      <path d="M7.5 9.5 H14" />
      <path d="M7.5 12.5 H16.5" />
      <path d="M7.5 15.5 H12.5" />
    </g>
  ),
  messages: (
    <path
      d="M5 16.5 V8.5 a3 3 0 0 1 3-3 H16 a3 3 0 0 1 3 3 v4.5 a3 3 0 0 1 -3 3 H10 l-5 3.5 z"
      fill="none"
    />
  ),
  following: (
    <g>
      <circle cx="9.5" cy="9" r="3" fill="none" />
      <path d="M4 19 a5.5 5.5 0 0 1 11 0" />
      <path d="M16 7.2 a2.6 2.6 0 0 1 0 5" />
      <path d="M17.5 14 a4.6 4.6 0 0 1 3 4.6" />
    </g>
  ),
  stamp: (
    <g>
      <path
        d="M12 21 c0 0 6-5.3 6-9.7 a6 6 0 1 0 -12 0 c0 4.4 6 9.7 6 9.7 z"
        fill="none"
      />
      <circle cx="12" cy="11" r="2.1" fill="none" />
    </g>
  ),
  more: (
    <g stroke="none" fill="currentColor">
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

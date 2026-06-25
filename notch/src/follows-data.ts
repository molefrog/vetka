// Mock data for the Follows popup. Entirely fictional, generic handles — no
// real people. Avatars are deterministic facehash faces seeded by `seed`.
//
// TODO(api): replace `loadFollows()` with a real fetch once the endpoint exists,
// e.g. `GET ${apiBase}/api/notch/follows` (same pattern as Widget's /api/notch/me).
// Shape returned should match `Follow[]`.

export type Follow = {
  id: string
  name: string
  seed: string // facehash seed (stable)
  handle: string // "@handle" — shown as the secondary line
  bio?: string
  following: boolean // whether the viewer currently follows them
}

export const FOLLOWS: Follow[] = [
  { id: 'maya', name: 'Maya R.', seed: 'maya-r', handle: '@mayar', following: true },
  { id: 'jordan', name: 'Jordan Kane', seed: 'jordan-k', handle: '@jkane', following: true },
  { id: 'priya', name: 'Priya N.', seed: 'priya-n', handle: '@priya', following: true },
  { id: 'noah', name: 'Noah T.', seed: 'noah-t', handle: '@noaht', following: true },
  { id: 'lena', name: 'Lena K.', seed: 'lena-k', handle: '@lenak', following: false },
  { id: 'theo', name: 'Theo M.', seed: 'theo-m', handle: '@theom', following: true },
  { id: 'iris', name: 'Iris V.', seed: 'iris-v', handle: '@irisv', following: false },
]

export const followingCount = (list: Follow[]) =>
  list.filter((f) => f.following).length

// Placeholder loader — returns the mock now; swap the body for the API call later.
export async function loadFollows(): Promise<Follow[]> {
  return FOLLOWS
}

// Mock DM data for the Messages popup. Entirely fictional, generic names —
// no real people. Avatars are deterministic facehash faces seeded by `seed`.

export type MockMessage = { id: string; fromMe: boolean; text: string }

export type Conversation = {
  id: string
  name: string
  seed: string // facehash seed (stable)
  preview: string // last-message preview line
  time: string // "1h" | "2h" | "1d" | "" (empty when showing `status` instead)
  status?: string // e.g. "Active 2h ago" — shown in place of `preview`
  unread?: boolean // blue unread dot
  thread: MockMessage[]
}

export const CONVERSATIONS: Conversation[] = [
  {
    id: 'maya',
    name: 'Maya R.',
    seed: 'maya-r',
    preview: 'You: sounds good, talk later',
    time: '1h',
    thread: [
      { id: 'm1', fromMe: false, text: 'are you around this afternoon?' },
      { id: 'm2', fromMe: true, text: 'yeah, after 3 works' },
      { id: 'm3', fromMe: false, text: 'perfect, i’ll send an invite' },
      { id: 'm4', fromMe: true, text: 'sounds good, talk later' },
    ],
  },
  {
    id: 'jordan',
    name: 'Jordan',
    seed: 'jordan-k',
    preview: 'You: 👍',
    time: '2h',
    thread: [
      { id: 'j1', fromMe: false, text: 'pushed the fix, can you check?' },
      { id: 'j2', fromMe: true, text: '👍' },
    ],
  },
  {
    id: 'priya',
    name: 'Priya',
    seed: 'priya-n',
    preview: '4 new messages',
    time: '22h',
    unread: true,
    thread: [
      { id: 'p1', fromMe: false, text: 'hey!' },
      { id: 'p2', fromMe: false, text: 'did you see the new mockups?' },
      { id: 'p3', fromMe: false, text: 'i think the layout finally clicks' },
      { id: 'p4', fromMe: false, text: 'let me know what you think' },
    ],
  },
  {
    id: 'noah',
    name: 'Noah',
    seed: 'noah-t',
    preview: 'Let’s sync tomorrow morning',
    time: '23h',
    unread: true,
    thread: [
      { id: 'n1', fromMe: true, text: 'swamped today, raincheck?' },
      { id: 'n2', fromMe: false, text: 'no worries' },
      { id: 'n3', fromMe: false, text: 'let’s sync tomorrow morning' },
    ],
  },
  {
    id: 'lena',
    name: 'Lena K.',
    seed: 'lena-k',
    preview: 'Liked a message',
    time: '1d',
    unread: true,
    thread: [
      { id: 'l1', fromMe: true, text: 'shipped it 🚀' },
      { id: 'l2', fromMe: false, text: '❤️' },
    ],
  },
  {
    id: 'theo',
    name: 'Theo',
    seed: 'theo-m',
    preview: '',
    time: '',
    status: 'Active 2h ago',
    thread: [{ id: 't1', fromMe: false, text: 'gm' }],
  },
  {
    id: 'sam',
    name: 'Sam',
    seed: 'sam-d',
    preview: 'You: see you then',
    time: '2d',
    thread: [
      { id: 's1', fromMe: false, text: 'coffee friday?' },
      { id: 's2', fromMe: true, text: 'see you then' },
    ],
  },
  {
    id: 'iris',
    name: 'Iris',
    seed: 'iris-v',
    preview: 'Thanks!',
    time: '3d',
    thread: [
      { id: 'i1', fromMe: true, text: 'sent over the files' },
      { id: 'i2', fromMe: false, text: 'thanks!' },
    ],
  },
]

export const unreadCount = (list: Conversation[]) =>
  list.filter((c) => c.unread).length

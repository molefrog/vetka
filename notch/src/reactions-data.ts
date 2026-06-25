import { id } from '@instantdb/react'
import { db } from './instant'

export type Signal = 'heart' | 'star' | 'fire' | 'wow' | 'like' | 'idea' | 'save' | 'question'

export interface ReactionInput {
  pageUrl: string
  domain: string
  signal: Signal
  x: number
  y: number
  authorName: string
  authorSeed: string
}

// Tilt is computed once at placement and stored — never recomputed on render.
export function createReaction(input: ReactionInput) {
  const tilt = Math.round(Math.random() * 26 - 13)
  return db.transact([
    db.tx.reactions[id()].update({
      ...input,
      tilt,
      createdAt: Date.now(),
    }),
  ])
}

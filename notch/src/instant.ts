import { init } from '@instantdb/react'
import type { AppSchema } from '../../src/instant.schema'

export const db = init<AppSchema>({ appId: 'd77e13c6-1011-474e-a60b-c1a93da97e24' })

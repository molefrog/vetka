import { db } from '../src/db'
import { agentSession, user } from '../src/db/schema'
import { tangledIdentity } from '../src/db/schema'
import { eq } from 'drizzle-orm'

const [found] = await db
  .select({ id: user.id, name: user.name })
  .from(user)
  .innerJoin(tangledIdentity, eq(tangledIdentity.userId, user.id))
  .where(eq(tangledIdentity.handle, 'molefrog.tngl.sh'))

console.log('User:', found)

const deleted = await db.delete(agentSession).where(eq(agentSession.userId, found.id)).returning()
console.log('Deleted sessions:', deleted)

process.exit(0)

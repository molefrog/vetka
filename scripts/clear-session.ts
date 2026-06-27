// Clear a user's Managed Agent session by email.
// Run with: bun --env-file=.env scripts/clear-session.ts <email>
import { db } from '../src/db'
import { agentSession, user } from '../src/db/schema'
import { eq } from 'drizzle-orm'

const email = process.argv[2] ?? 'molefrog@gmail.com'

const [found] = await db
  .select({ id: user.id, name: user.name, email: user.email })
  .from(user)
  .where(eq(user.email, email))

console.log('User:', found)

if (found) {
  const deleted = await db.delete(agentSession).where(eq(agentSession.userId, found.id)).returning()
  console.log('Deleted sessions:', deleted)
}

process.exit(0)

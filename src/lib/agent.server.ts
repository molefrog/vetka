import Anthropic from '@anthropic-ai/sdk'
import { db } from '../db'
import { agentSession } from '../db/schema'
import { eq } from 'drizzle-orm'

const AGENT_ID = 'agent_019VzGQn8ggkHmQxrDrHcJjU'
const ENV_ID = 'env_016Mr6pEcERwBFoo1Jmzv8Yu'

export function getAnthropicClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
}

export async function getOrCreateSession(userId: string): Promise<{
  sessionId: string
  sshPublicKey: string | null
}> {
  const existing = await db
    .select()
    .from(agentSession)
    .where(eq(agentSession.userId, userId))
    .limit(1)

  if (existing.length > 0) {
    return {
      sessionId: existing[0].sessionId,
      sshPublicKey: existing[0].sshPublicKey,
    }
  }

  const client = getAnthropicClient()

  const session = await client.beta.sessions.create({
    agent: AGENT_ID,
    environment_id: ENV_ID,
  })

  await db.insert(agentSession).values({
    userId,
    sessionId: session.id,
  })

  return { sessionId: session.id, sshPublicKey: null }
}

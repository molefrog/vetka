import Anthropic from '@anthropic-ai/sdk'
import { db } from '../db'
import { agentSession } from '../db/schema'
import { eq } from 'drizzle-orm'

// Agent config — managed in the Anthropic console.
// To update the system prompt + tools: edit and re-run scripts/update-agent.mjs.
// To recreate the environment: run scripts/create-environment.mjs.
const AGENT_ID = process.env.ANTHROPIC_AGENT_ID ?? 'agent_019VzGQn8ggkHmQxrDrHcJjU'
const ENV_ID = process.env.ANTHROPIC_ENV_ID ?? 'env_01AKeJed2CAzKMdAMmQ3zTnN'

export function getAnthropicClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
}

// One persistent Managed Agent session per user. The session is the live dev
// sandbox the agent builds the site in; deploys are published to storage via
// /api/agent/deploy (authorized by the session id), so no SSH keys are needed.
export async function getOrCreateSession(userId: string): Promise<{ sessionId: string }> {
  const existing = await db
    .select()
    .from(agentSession)
    .where(eq(agentSession.userId, userId))
    .limit(1)

  if (existing.length > 0) {
    return { sessionId: existing[0].sessionId }
  }

  const client = getAnthropicClient()
  const session = await client.beta.sessions.create({
    agent: AGENT_ID,
    environment_id: ENV_ID,
  })

  await db
    .insert(agentSession)
    .values({ userId, sessionId: session.id })
    .onConflictDoUpdate({
      target: agentSession.userId,
      set: { sessionId: session.id, updatedAt: new Date() },
    })

  return { sessionId: session.id }
}

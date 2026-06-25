import Anthropic from '@anthropic-ai/sdk'
import { generateKeyPairSync } from 'crypto'
import { db } from '../db'
import { agentSession } from '../db/schema'
import { eq } from 'drizzle-orm'

// Agent config — managed in the Anthropic console.
// To update the system prompt: edit and re-run scripts/update-agent.mjs.
// To recreate the environment: run scripts/create-environment.mjs.
// To re-upload helpers: run scripts/upload-helpers.mjs.
const AGENT_ID = 'agent_019VzGQn8ggkHmQxrDrHcJjU'
const ENV_ID = 'env_01AKeJed2CAzKMdAMmQ3zTnN'

// Shared helper scripts — uploaded once via scripts/upload-helpers.mjs.
// Mounted read-only into every session at /workspace/scripts/.
const HELPER_SETUP_FILE_ID = 'file_011CcPunhgLgu6fGss2euwjr'
const HELPER_SCREENSHOT_FILE_ID = 'file_011CcPunjUyfsSazoRd2U5eY'

export function getAnthropicClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
}

// Generate an Ed25519 SSH keypair.
// Returns privateKey as PKCS8 PEM (accepted by OpenSSH 7.8+) and
// publicKey in OpenSSH wire format (ready for authorized_keys / Tangled settings).
function generateSSHKeyPair(): { privateKey: string; publicKey: string } {
  const { privateKey: privKey, publicKey: pubKey } = generateKeyPairSync('ed25519')

  const privateKeyPem = privKey.export({ format: 'pem', type: 'pkcs8' }) as string

  // Ed25519 SPKI DER layout: 12-byte header + 32-byte raw public key
  const pubDer = pubKey.export({ format: 'der', type: 'spki' }) as Buffer
  const keyBytes = pubDer.slice(12)

  const type = 'ssh-ed25519'
  const typeBuf = Buffer.from(type)
  const typeLen = Buffer.alloc(4); typeLen.writeUInt32BE(typeBuf.length)
  const keyLen = Buffer.alloc(4); keyLen.writeUInt32BE(keyBytes.length)
  const wire = Buffer.concat([typeLen, typeBuf, keyLen, keyBytes])

  return { privateKey: privateKeyPem, publicKey: `${type} ${wire.toString('base64')} vetka-agent` }
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

  // Generate SSH keypair for this user
  const { privateKey, publicKey } = generateSSHKeyPair()

  // Upload private key to Files API so we can mount it in the session sandbox
  const privBlob = new Blob([privateKey], { type: 'text/plain' })
  const privFile = await client.beta.files.upload({
    file: new File([privBlob], 'id_vetka', { type: 'text/plain' }),
  })

  // Build resource list: SSH key + helper scripts (if uploaded)
  type FileResource = { type: 'file'; file_id: string; mount_path: string }
  const resources: FileResource[] = [
    { type: 'file', file_id: privFile.id, mount_path: '/root/.ssh/id_vetka' },
  ]
  if (HELPER_SETUP_FILE_ID) {
    resources.push({ type: 'file', file_id: HELPER_SETUP_FILE_ID, mount_path: '/workspace/scripts/setup.sh' })
  }
  if (HELPER_SCREENSHOT_FILE_ID) {
    resources.push({ type: 'file', file_id: HELPER_SCREENSHOT_FILE_ID, mount_path: '/workspace/scripts/screenshot.ts' })
  }

  const session = await client.beta.sessions.create({
    agent: AGENT_ID,
    environment_id: ENV_ID,
    resources: resources as any,
  })

  await db
    .insert(agentSession)
    .values({
      userId,
      sessionId: session.id,
      sshPrivateKey: privateKey,
      sshPublicKey: publicKey,
      sshKeyFileId: privFile.id,
    })
    .onConflictDoUpdate({
      target: agentSession.userId,
      set: {
        sessionId: session.id,
        sshPrivateKey: privateKey,
        sshPublicKey: publicKey,
        sshKeyFileId: privFile.id,
        updatedAt: new Date(),
      },
    })

  return { sessionId: session.id, sshPublicKey: publicKey }
}

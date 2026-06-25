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

// Encode a uint32 as 4 big-endian bytes (SSH wire format helper).
function u32(n: number): Buffer {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(n)
  return b
}

// Prefix a buffer with its uint32 length (SSH string encoding).
function sshStr(data: Buffer | string): Buffer {
  const b = Buffer.isBuffer(data) ? data : Buffer.from(data)
  return Buffer.concat([u32(b.length), b])
}

// Generate an Ed25519 SSH keypair.
// Produces privateKey in OpenSSH format (-----BEGIN OPENSSH PRIVATE KEY-----)
// and publicKey in authorized_keys format (ssh-ed25519 <base64> vetka-agent).
function generateSSHKeyPair(): { privateKey: string; publicKey: string } {
  const { privateKey: privKey, publicKey: pubKey } = generateKeyPairSync('ed25519')

  // Extract raw 32-byte key material from DER blobs.
  // Ed25519 PKCS8 DER: 16-byte wrapper, then 32-byte seed.
  const privDer = privKey.export({ format: 'der', type: 'pkcs8' }) as Buffer
  const seed = privDer.slice(16) // 32-byte private seed

  // Ed25519 SPKI DER: 12-byte wrapper, then 32-byte public key.
  const pubDer = pubKey.export({ format: 'der', type: 'spki' }) as Buffer
  const pub = pubDer.slice(12) // 32-byte public key

  // OpenSSH private key blob (unencrypted, cipher=none, kdf=none)
  const keyType = Buffer.from('ssh-ed25519')
  const pubKeySection = Buffer.concat([sshStr(keyType), sshStr(pub)])
  const checkInt = u32(Math.floor(Math.random() * 0xffffffff))
  // Private key in OpenSSH = seed + pub (64 bytes)
  const privateSection = Buffer.concat([
    checkInt,
    checkInt, // must match
    sshStr(keyType),
    sshStr(pub),
    sshStr(Buffer.concat([seed, pub])), // 64-byte private blob
    sshStr(Buffer.from('vetka-agent')),  // comment
  ])
  // Pad to multiple of 8 (block size for cipher=none)
  const paddingLen = (8 - (privateSection.length % 8)) % 8
  const padding = Buffer.from(Array.from({ length: paddingLen }, (_, i) => i + 1))

  const body = Buffer.concat([
    Buffer.from('openssh-key-v1\0'),
    sshStr(Buffer.from('none')), // cipher
    sshStr(Buffer.from('none')), // kdf
    sshStr(Buffer.alloc(0)),     // kdf options (empty)
    u32(1),                      // number of keys
    sshStr(pubKeySection),
    sshStr(Buffer.concat([privateSection, padding])),
  ])

  const privateKey =
    '-----BEGIN OPENSSH PRIVATE KEY-----\n' +
    body.toString('base64').match(/.{1,70}/g)!.join('\n') +
    '\n-----END OPENSSH PRIVATE KEY-----\n'

  // Public key in authorized_keys format
  const wire = Buffer.concat([sshStr(keyType), sshStr(pub)])
  const publicKey = `ssh-ed25519 ${wire.toString('base64')} vetka-agent`

  return { privateKey, publicKey }
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

import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { db } from '../../../db'
import { agentSession, tangledIdentity } from '../../../db/schema'

export const Route = createFileRoute('/api/agent/push')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Auth: agent passes its Anthropic session ID as bearer token
        const authHeader = request.headers.get('Authorization')
        const sessionId = authHeader?.replace(/^Bearer\s+/, '').trim()
        if (!sessionId) {
          return Response.json({ error: 'Missing Authorization header' }, { status: 401 })
        }

        const sessionRows = await db
          .select()
          .from(agentSession)
          .where(eq(agentSession.sessionId, sessionId))
          .limit(1)

        if (!sessionRows.length || !sessionRows[0].sshPrivateKey) {
          return Response.json({ error: 'Invalid token or no SSH key configured' }, { status: 401 })
        }

        const sess = sessionRows[0]

        const identityRows = await db
          .select()
          .from(tangledIdentity)
          .where(eq(tangledIdentity.userId, sess.userId))
          .limit(1)

        const identity = identityRows[0]
        if (!identity?.selectedRepoName || !identity?.selectedRepoKnot || !identity?.did) {
          return Response.json({ error: 'No repo configured' }, { status: 400 })
        }

        const formData = await request.formData()
        const bundleFile = formData.get('bundle') as File | null
        if (!bundleFile) {
          return Response.json({ error: 'No bundle provided' }, { status: 400 })
        }

        const bundleBytes = await bundleFile.arrayBuffer()

        const sshUrl = `git@${identity.selectedRepoKnot}:${identity.did}/${identity.selectedRepoName}.git`

        const tmpDir = mkdtempSync(join(tmpdir(), 'vetka-push-'))
        const keyPath = join(tmpDir, 'id_vetka')
        const bundlePath = join(tmpDir, 'push.bundle')
        const repoPath = join(tmpDir, 'repo')

        try {
          writeFileSync(keyPath, sess.sshPrivateKey, { mode: 0o600 })
          writeFileSync(bundlePath, Buffer.from(bundleBytes))

          const env = {
            ...process.env,
            GIT_SSH_COMMAND: `ssh -i ${keyPath} -o StrictHostKeyChecking=no -o ConnectTimeout=15 -4`,
            HOME: tmpDir,
          }

          execFileSync('git', ['clone', sshUrl, repoPath], { env, stdio: 'pipe', timeout: 60_000 })
          execFileSync('git', ['-C', repoPath, 'fetch', bundlePath, 'HEAD:refs/heads/incoming'], { env, stdio: 'pipe' })
          execFileSync('git', ['-C', repoPath, 'merge', '--ff-only', 'refs/heads/incoming'], { env, stdio: 'pipe' })
          execFileSync('git', ['-C', repoPath, 'push', 'origin', 'HEAD'], { env, stdio: 'pipe', timeout: 60_000 })

          const hash = execFileSync('git', ['-C', repoPath, 'rev-parse', 'HEAD'], { env, stdio: 'pipe' })
            .toString()
            .trim()

          return Response.json({ hash, url: `https://${identity.handle}` })
        } catch (err: any) {
          const stderr = (err.stderr?.toString() ?? err.stdout?.toString() ?? err.message ?? String(err)).slice(0, 500)
          return Response.json({ error: `Push failed: ${stderr}` }, { status: 500 })
        } finally {
          rmSync(tmpDir, { recursive: true, force: true })
        }
      },
    },
  },
})

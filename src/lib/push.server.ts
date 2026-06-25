import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { tangledIdentity } from '../db/schema'

export async function pushBundle(
  bundleBytes: Buffer,
  userId: string,
): Promise<{ hash: string; url: string } | { error: string }> {
  const [identity] = await db.select().from(tangledIdentity).where(eq(tangledIdentity.userId, userId)).limit(1)
  if (!identity?.sshPrivateKey) return { error: 'No SSH key configured — complete setup at /setup/tangled' }
  if (!identity?.selectedRepoName || !identity?.handle) return { error: 'No repo configured' }

  const sshUrl = `git@tangled.org:${identity.handle}/${identity.selectedRepoName}.git`
  const tmpDir = mkdtempSync(join(tmpdir(), 'vetka-push-'))
  const keyPath = join(tmpDir, 'id_vetka')
  const bundlePath = join(tmpDir, 'push.bundle')
  const repoPath = join(tmpDir, 'repo')

  try {
    writeFileSync(keyPath, identity.sshPrivateKey!, { mode: 0o600 })
    writeFileSync(bundlePath, bundleBytes)

    const env = {
      ...process.env,
      GIT_SSH_COMMAND: `ssh -i ${keyPath} -o IdentitiesOnly=yes -o StrictHostKeyChecking=no -o ConnectTimeout=15 -4`,
      HOME: tmpDir,
    }

    execFileSync('git', ['clone', sshUrl, repoPath], { env, stdio: 'pipe', timeout: 60_000 })
    execFileSync('git', ['-C', repoPath, 'fetch', bundlePath, 'HEAD:refs/heads/incoming'], { env, stdio: 'pipe' })
    execFileSync('git', ['-C', repoPath, 'merge', '--ff-only', 'refs/heads/incoming'], { env, stdio: 'pipe' })
    execFileSync('git', ['-C', repoPath, 'push', 'origin', 'HEAD'], { env, stdio: 'pipe', timeout: 60_000 })

    const hash = execFileSync('git', ['-C', repoPath, 'rev-parse', 'HEAD'], { env, stdio: 'pipe' })
      .toString().trim()

    return { hash, url: `https://${identity.handle}` }
  } catch (err: any) {
    const stderr = (err.stderr?.toString() ?? err.message ?? String(err)).slice(0, 600)
    return { error: `Push failed: ${stderr}` }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

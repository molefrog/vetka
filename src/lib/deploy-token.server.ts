// ---------------------------------------------------------------------------
// Short-lived, per-site deploy tokens.
//
// The build agent never holds a long-lived credential. It calls the
// `get_deploy_credentials` custom tool, which mints a fresh token here, then
// authorizes POST /api/agent/deploy with it. We store only the SHA-256 hash;
// the plaintext is returned to the agent once. Tokens expire (default 2h) — on
// rejection the agent calls the tool again to refresh.
// ---------------------------------------------------------------------------

import { randomBytes, createHash } from 'node:crypto'
import { and, eq, gt, lt } from 'drizzle-orm'
import { db } from '../db'
import { deployToken, site } from '../db/schema'

export const DEPLOY_TOKEN_TTL_SECONDS = 2 * 60 * 60 // 2 hours

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

// Mint a new deploy token for a site. Returns the plaintext token (shown once)
// and its expiry. Best-effort prunes this site's already-expired tokens.
export async function mintDeployToken(
  siteId: string,
  ttlSeconds: number = DEPLOY_TOKEN_TTL_SECONDS,
): Promise<{ token: string; expiresAt: Date }> {
  const token = `vdt_${randomBytes(32).toString('base64url')}`
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000)

  await db.insert(deployToken).values({ siteId, tokenHash: hashToken(token), expiresAt })

  // Opportunistic cleanup of expired rows for this site.
  await db.delete(deployToken).where(and(eq(deployToken.siteId, siteId), lt(deployToken.expiresAt, new Date())))

  return { token, expiresAt }
}

// Validate a presented token. Returns the target siteId, or a reason if invalid.
export async function verifyDeployToken(
  token: string,
): Promise<{ ok: true; siteId: string } | { ok: false; reason: 'invalid' | 'expired' }> {
  const [row] = await db
    .select({ id: deployToken.id, siteId: deployToken.siteId, expiresAt: deployToken.expiresAt })
    .from(deployToken)
    .where(eq(deployToken.tokenHash, hashToken(token)))
    .limit(1)

  if (!row) return { ok: false, reason: 'invalid' }
  if (row.expiresAt.getTime() <= Date.now()) return { ok: false, reason: 'expired' }

  // Token must still point at a generated site.
  const [target] = await db
    .select({ id: site.id })
    .from(site)
    .where(and(eq(site.id, row.siteId), eq(site.kind, 'generated')))
    .limit(1)
  if (!target) return { ok: false, reason: 'invalid' }

  return { ok: true, siteId: row.siteId }
}

// Whether a site currently has at least one unexpired token (used to avoid
// minting redundantly if you ever want to reuse — not required by the flow).
export async function hasActiveToken(siteId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: deployToken.id })
    .from(deployToken)
    .where(and(eq(deployToken.siteId, siteId), gt(deployToken.expiresAt, new Date())))
    .limit(1)
  return !!row
}

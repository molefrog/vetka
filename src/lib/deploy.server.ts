// ---------------------------------------------------------------------------
// Deploy + rollback for generated sites.
//
// The agent builds a static site (bun's bundler → a `dist/` directory) and
// hands the built files to /api/agent/deploy. Each deploy becomes an immutable
// `site_snapshot`: its files are written under the snapshot's storage prefix,
// then published to the site's "live" prefix that the *.web.sh serving route
// reads from. `site.liveSnapshotId` records which snapshot is currently live so
// we can roll back to any earlier version by re-publishing its files.
// ---------------------------------------------------------------------------

import { eq, and } from 'drizzle-orm'
import { db } from '../db'
import { site, siteSnapshot } from '../db/schema'
import { getStorage, storageKeys, contentTypeFor } from './storage.server'

export type DeployFile = { path: string; content: Buffer }

export type DeployResult =
  | { ok: true; snapshotId: string; url: string; fileCount: number; byteSize: number }
  | { ok: false; error: string }

// Reject path traversal / absolute paths in agent-supplied file names.
function sanitizeRelPath(p: string): string | null {
  const clean = p.replace(/^\.?\/+/, '').replace(/\\/g, '/')
  if (!clean || clean.startsWith('/') || clean.split('/').some((seg) => seg === '..' || seg === '')) return null
  return clean
}

export async function deploySite(
  siteId: string,
  files: DeployFile[],
  opts: { message?: string; triggeredBy?: 'agent' | 'manual' } = {},
): Promise<DeployResult> {
  const [siteRow] = await db.select().from(site).where(eq(site.id, siteId)).limit(1)
  if (!siteRow) return { ok: false, error: 'Site not found' }
  if (siteRow.kind !== 'generated') return { ok: false, error: 'Only generated sites can be deployed' }
  if (!files.length) return { ok: false, error: 'No files to deploy' }

  // Validate + normalize incoming files before we touch storage.
  const normalized: DeployFile[] = []
  let byteSize = 0
  for (const f of files) {
    const rel = sanitizeRelPath(f.path)
    if (!rel) return { ok: false, error: `Invalid file path: ${f.path}` }
    normalized.push({ path: rel, content: f.content })
    byteSize += f.content.length
  }
  if (!normalized.some((f) => f.path === 'index.html')) {
    return { ok: false, error: 'Deploy must include an index.html at the root' }
  }

  const storage = getStorage()

  const [snap] = await db
    .insert(siteSnapshot)
    .values({
      siteId,
      status: 'building',
      message: opts.message ?? null,
      triggeredBy: opts.triggeredBy ?? 'agent',
    })
    .returning()

  const snapshotPrefix = storageKeys.snapshot(siteId, snap.id)
  const livePrefix = storageKeys.live(siteId)

  try {
    // Write the immutable snapshot copy.
    for (const f of normalized) {
      await storage.put(snapshotPrefix + f.path, f.content, contentTypeFor(f.path))
    }

    // Publish to the live prefix (replace whatever is currently served).
    await storage.deletePrefix(livePrefix)
    await storage.copyPrefix(snapshotPrefix, livePrefix)

    await db
      .update(siteSnapshot)
      .set({
        status: 'success',
        storagePrefix: snapshotPrefix,
        fileCount: normalized.length,
        byteSize,
      })
      .where(eq(siteSnapshot.id, snap.id))

    await db
      .update(site)
      .set({ status: 'live', liveSnapshotId: snap.id, updatedAt: new Date() })
      .where(eq(site.id, siteId))

    return {
      ok: true,
      snapshotId: snap.id,
      url: `https://${siteRow.domain}`,
      fileCount: normalized.length,
      byteSize,
    }
  } catch (err) {
    await db.update(siteSnapshot).set({ status: 'failed' }).where(eq(siteSnapshot.id, snap.id))
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// Re-publish an earlier successful snapshot as the live version.
export async function rollbackSite(siteId: string, snapshotId: string): Promise<DeployResult> {
  const [siteRow] = await db.select().from(site).where(eq(site.id, siteId)).limit(1)
  if (!siteRow) return { ok: false, error: 'Site not found' }

  const [snap] = await db
    .select()
    .from(siteSnapshot)
    .where(and(eq(siteSnapshot.id, snapshotId), eq(siteSnapshot.siteId, siteId)))
    .limit(1)
  if (!snap) return { ok: false, error: 'Snapshot not found for this site' }
  if (snap.status !== 'success' || !snap.storagePrefix) return { ok: false, error: 'Snapshot is not deployable' }

  const storage = getStorage()
  const livePrefix = storageKeys.live(siteId)

  try {
    await storage.deletePrefix(livePrefix)
    const fileCount = await storage.copyPrefix(snap.storagePrefix, livePrefix)
    await db
      .update(site)
      .set({ status: 'live', liveSnapshotId: snap.id, updatedAt: new Date() })
      .where(eq(site.id, siteId))
    return { ok: true, snapshotId: snap.id, url: `https://${siteRow.domain}`, fileCount, byteSize: snap.byteSize }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

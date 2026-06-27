// ---------------------------------------------------------------------------
// Object storage for deployed static sites.
//
// Generated sites are served from storage (not from a git repo). Each deploy
// writes the built files under a key prefix; the wildcard `*.web.sh` serving
// route (src/routes/api/serve/$.ts) reads them back.
//
// Two interchangeable drivers:
//   - local : files on disk under STORAGE_LOCAL_DIR (default ./.storage).
//             Used for development — no cloud credentials required.
//   - s3    : any S3-compatible bucket. Defaults target Cloudflare R2 (set
//             R2_ENDPOINT); the same code works for AWS S3 by pointing the
//             endpoint/creds at S3 instead.
//
// Selection: STORAGE_DRIVER ('local' | 's3'), else 's3' when an endpoint +
// bucket are configured, else 'local'.
// ---------------------------------------------------------------------------

import { mkdir, readFile, writeFile, readdir, rm, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname, extname, relative, sep } from 'node:path'

export type StoredObject = { body: Uint8Array; contentType: string }

export interface Storage {
  put(key: string, body: Uint8Array | Buffer | string, contentType?: string): Promise<void>
  get(key: string): Promise<StoredObject | null>
  list(prefix: string): Promise<string[]>
  deletePrefix(prefix: string): Promise<void>
  copyPrefix(srcPrefix: string, destPrefix: string): Promise<number>
}

// Minimal extension → content-type map for the file kinds a static site uses.
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
}

export function contentTypeFor(key: string): string {
  return MIME[extname(key).toLowerCase()] ?? 'application/octet-stream'
}

function normalizeKey(key: string): string {
  return key.replace(/^\/+/, '').replace(/\/+/g, '/')
}

// --- local filesystem driver ------------------------------------------------

class LocalStorage implements Storage {
  constructor(private baseDir: string) {}

  private path(key: string): string {
    return join(this.baseDir, normalizeKey(key))
  }

  async put(key: string, body: Uint8Array | Buffer | string, _contentType?: string): Promise<void> {
    const p = this.path(key)
    await mkdir(dirname(p), { recursive: true })
    const data = typeof body === 'string' ? Buffer.from(body) : body
    await writeFile(p, data)
  }

  async get(key: string): Promise<StoredObject | null> {
    const p = this.path(key)
    if (!existsSync(p)) return null
    try {
      const buf = await readFile(p)
      return { body: new Uint8Array(buf), contentType: contentTypeFor(key) }
    } catch {
      return null
    }
  }

  async list(prefix: string): Promise<string[]> {
    const root = this.path(prefix)
    if (!existsSync(root)) return []
    const out: string[] = []
    const walk = async (dir: string) => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) await walk(full)
        else out.push(normalizeKey(relative(this.baseDir, full).split(sep).join('/')))
      }
    }
    const s = await stat(root)
    if (s.isDirectory()) await walk(root)
    return out
  }

  async deletePrefix(prefix: string): Promise<void> {
    const root = this.path(prefix)
    if (existsSync(root)) await rm(root, { recursive: true, force: true })
  }

  async copyPrefix(srcPrefix: string, destPrefix: string): Promise<number> {
    const keys = await this.list(srcPrefix)
    const src = normalizeKey(srcPrefix).replace(/\/?$/, '/')
    const dest = normalizeKey(destPrefix).replace(/\/?$/, '/')
    let n = 0
    for (const key of keys) {
      const obj = await this.get(key)
      if (!obj) continue
      await this.put(dest + key.slice(src.length), obj.body)
      n++
    }
    return n
  }
}

// --- S3-compatible driver (Cloudflare R2 / AWS S3) --------------------------
//
// The @aws-sdk/client-s3 import is dynamic so the app still builds and runs on
// the local driver even if the SDK isn't installed.

class S3Storage implements Storage {
  private clientPromise: Promise<any> | null = null

  constructor(
    private bucket: string,
    private opts: { endpoint?: string; region?: string; accessKeyId: string; secretAccessKey: string },
  ) {}

  private async client() {
    if (!this.clientPromise) {
      this.clientPromise = import('@aws-sdk/client-s3').then(({ S3Client }) =>
        new S3Client({
          region: this.opts.region ?? 'auto',
          endpoint: this.opts.endpoint,
          credentials: { accessKeyId: this.opts.accessKeyId, secretAccessKey: this.opts.secretAccessKey },
        }),
      )
    }
    return this.clientPromise
  }

  async put(key: string, body: Uint8Array | Buffer | string, contentType?: string): Promise<void> {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3')
    const client = await this.client()
    const data = typeof body === 'string' ? Buffer.from(body) : body
    await client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: normalizeKey(key),
        Body: data,
        ContentType: contentType ?? contentTypeFor(key),
      }),
    )
  }

  async get(key: string): Promise<StoredObject | null> {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3')
    const client = await this.client()
    try {
      const res = await client.send(new GetObjectCommand({ Bucket: this.bucket, Key: normalizeKey(key) }))
      const bytes = await res.Body.transformToByteArray()
      return { body: bytes, contentType: res.ContentType ?? contentTypeFor(key) }
    } catch (err: any) {
      if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) return null
      throw err
    }
  }

  async list(prefix: string): Promise<string[]> {
    const { ListObjectsV2Command } = await import('@aws-sdk/client-s3')
    const client = await this.client()
    const out: string[] = []
    let token: string | undefined
    do {
      const res = await client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: normalizeKey(prefix), ContinuationToken: token }),
      )
      for (const obj of res.Contents ?? []) if (obj.Key) out.push(obj.Key)
      token = res.IsTruncated ? res.NextContinuationToken : undefined
    } while (token)
    return out
  }

  async deletePrefix(prefix: string): Promise<void> {
    const { DeleteObjectsCommand } = await import('@aws-sdk/client-s3')
    const client = await this.client()
    const keys = await this.list(prefix)
    for (let i = 0; i < keys.length; i += 1000) {
      const batch = keys.slice(i, i + 1000)
      if (!batch.length) continue
      await client.send(
        new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: batch.map((Key) => ({ Key })) } }),
      )
    }
  }

  async copyPrefix(srcPrefix: string, destPrefix: string): Promise<number> {
    const { CopyObjectCommand } = await import('@aws-sdk/client-s3')
    const client = await this.client()
    const keys = await this.list(srcPrefix)
    const src = normalizeKey(srcPrefix).replace(/\/?$/, '/')
    const dest = normalizeKey(destPrefix).replace(/\/?$/, '/')
    let n = 0
    for (const key of keys) {
      await client.send(
        new CopyObjectCommand({
          Bucket: this.bucket,
          CopySource: `${this.bucket}/${key}`,
          Key: dest + key.slice(src.length),
        }),
      )
      n++
    }
    return n
  }
}

// --- driver selection -------------------------------------------------------

let cached: Storage | null = null

export function getStorage(): Storage {
  if (cached) return cached

  const driver =
    process.env.STORAGE_DRIVER ??
    ((process.env.R2_ENDPOINT || process.env.S3_ENDPOINT) && (process.env.R2_BUCKET || process.env.S3_BUCKET)
      ? 's3'
      : 'local')

  if (driver === 's3') {
    const bucket = process.env.R2_BUCKET ?? process.env.S3_BUCKET!
    const accessKeyId = process.env.R2_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID!
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY!
    cached = new S3Storage(bucket, {
      endpoint: process.env.R2_ENDPOINT ?? process.env.S3_ENDPOINT,
      region: process.env.S3_REGION ?? process.env.AWS_REGION,
      accessKeyId,
      secretAccessKey,
    })
  } else {
    cached = new LocalStorage(process.env.STORAGE_LOCAL_DIR ?? join(process.cwd(), '.storage'))
  }

  return cached
}

// Storage key helpers — keep the layout in one place.
export const storageKeys = {
  live: (siteId: string) => `sites/${siteId}/live/`,
  snapshot: (siteId: string, snapshotId: string) => `sites/${siteId}/snapshots/${snapshotId}/`,
}

/**
 * Update the thumbnail image for a site.
 * Resizes the input to 800×600 WebP (4:3, cover crop) and inserts a new
 * row into site_image. The latest row per site is the "current" thumbnail.
 *
 * Usage:
 *   node scripts/update-site-image.mjs --domain example.com --image ./screenshot.png
 *   node scripts/update-site-image.mjs --site-id <uuid>  --image ./screenshot.webp
 *
 * Requires DATABASE_URL in env.
 */

import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import postgres from 'postgres'

const require = createRequire(import.meta.url)
const sharp = require('sharp')

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
const get = (flag) => {
  const i = args.indexOf(flag)
  return i !== -1 ? args[i + 1] : null
}

const domain = get('--domain')
const siteId = get('--site-id')
const imagePath = get('--image')

if (!imagePath || (!domain && !siteId)) {
  console.error('Usage: node update-site-image.mjs (--domain <domain> | --site-id <uuid>) --image <path>')
  process.exit(1)
}

if (!existsSync(imagePath)) {
  console.error(`File not found: ${imagePath}`)
  process.exit(1)
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// DB
// ---------------------------------------------------------------------------

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' })

// Resolve site ID from domain if needed
let resolvedSiteId = siteId
if (!resolvedSiteId) {
  const rows = await sql`SELECT id FROM site WHERE domain = ${domain} LIMIT 1`
  if (!rows.length) {
    console.error(`No site found for domain: ${domain}`)
    await sql.end()
    process.exit(1)
  }
  resolvedSiteId = rows[0].id
  console.log(`Resolved site: ${resolvedSiteId}`)
}

// ---------------------------------------------------------------------------
// Resize image → 800×600 WebP
// ---------------------------------------------------------------------------

const TARGET_W = 800
const TARGET_H = 600

const raw = await readFile(imagePath)
const webpBuffer = await sharp(raw)
  .resize(TARGET_W, TARGET_H, { fit: 'cover', position: 'centre' })
  .webp({ quality: 85 })
  .toBuffer()

console.log(`Resized to ${TARGET_W}×${TARGET_H} WebP — ${(webpBuffer.length / 1024).toFixed(1)} KB`)

// ---------------------------------------------------------------------------
// Insert
// ---------------------------------------------------------------------------

const [row] = await sql`
  INSERT INTO site_image (site_id, data, mime_type, width, height, byte_size)
  VALUES (
    ${resolvedSiteId},
    ${webpBuffer},
    'image/webp',
    ${TARGET_W},
    ${TARGET_H},
    ${webpBuffer.length}
  )
  RETURNING id, created_at
`

console.log(`Inserted site_image ${row.id} at ${row.created_at}`)
await sql.end()

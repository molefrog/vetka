import { pgTable, text, timestamp, boolean, uuid, uniqueIndex, integer, index, customType } from 'drizzle-orm/pg-core'

// PostgreSQL bytea for raw binary blobs (images, etc.)
const bytea = customType<{ data: Buffer }>({
  dataType() { return 'bytea' },
})

// ---------------------------------------------------------------------------
// better-auth core tables (email + Google)
// ---------------------------------------------------------------------------

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  idToken: text('id_token'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// ---------------------------------------------------------------------------
// Agent sessions — one persistent Anthropic Managed Agent session per user.
// The session is the live dev sandbox + conversation history the agent uses to
// build a generated site. Deploys are authorized by the session id (see
// /api/agent/deploy), so no SSH keys are stored anymore.
// ---------------------------------------------------------------------------

export const agentSession = pgTable('agent_session', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' })
    .unique(),
  sessionId: text('session_id').notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// ---------------------------------------------------------------------------
// Sites — the primary social entity. A site is either:
//   - kind 'external'  : an existing website the user connected via the Notch
//                        <script> tag. `domain` is their own domain.
//   - kind 'generated' : a site built by the agent and hosted by us on a
//                        wildcard subdomain. `subdomain` is the *.web.sh label
//                        and `domain` is the full host (e.g. "evan.web.sh").
// ---------------------------------------------------------------------------

export const site = pgTable('site', {
  id: uuid('id').primaryKey().defaultRandom(),
  domain: text('domain').notNull().unique(),
  userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
  // 'external' | 'generated'
  kind: text('kind').notNull().default('external'),
  // Only set for generated sites — the <subdomain>.web.sh label, globally unique.
  subdomain: text('subdomain').unique(),
  status: text('status').notNull().default('draft'), // draft | building | live | error
  buildLog: text('build_log'),
  // The snapshot currently served from storage (rollback target / live pointer).
  liveSnapshotId: uuid('live_snapshot_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// Directed follow between two sites
export const follow = pgTable(
  'follow',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    followerId: uuid('follower_id')
      .notNull()
      .references(() => site.id, { onDelete: 'cascade' }),
    followeeId: uuid('followee_id')
      .notNull()
      .references(() => site.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('follow_pair').on(t.followerId, t.followeeId)],
)

// Direct messages between sites
export const message = pgTable('message', {
  id: uuid('id').primaryKey().defaultRandom(),
  fromId: uuid('from_id')
    .notNull()
    .references(() => site.id, { onDelete: 'cascade' }),
  toId: uuid('to_id')
    .notNull()
    .references(() => site.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  readAt: timestamp('read_at'),
})

// ---------------------------------------------------------------------------
// Site images — visual thumbnails stored as binary blobs.
// Format: WebP, exactly 800×600 (4:3). Many rows per site; the most recent
// row is the "current" thumbnail. Query: WHERE site_id = ? ORDER BY created_at DESC LIMIT 1
// ---------------------------------------------------------------------------

export const siteImage = pgTable(
  'site_image',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => site.id, { onDelete: 'cascade' }),
    data: bytea('data').notNull(),
    mimeType: text('mime_type').notNull().default('image/webp'),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    byteSize: integer('byte_size').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('site_image_site_created').on(t.siteId, t.createdAt)],
)

// ---------------------------------------------------------------------------
// Site snapshots — one immutable version per agent deploy. The built static
// files for a snapshot live in storage under `storagePrefix` (see
// src/lib/storage.server.ts); the "live" copy of a site is whichever snapshot
// `site.liveSnapshotId` points at. Rolling back = re-publishing an older
// snapshot's files and moving the pointer. Screenshot capture (imageId) is
// still a stub.
// ---------------------------------------------------------------------------

export const siteSnapshot = pgTable('site_snapshot', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id')
    .notNull()
    .references(() => site.id, { onDelete: 'cascade' }),
  imageId: uuid('image_id').references(() => siteImage.id, { onDelete: 'set null' }),
  // Storage key prefix holding this version's built files, e.g.
  // "sites/<siteId>/snapshots/<snapshotId>/".
  storagePrefix: text('storage_prefix'),
  fileCount: integer('file_count').notNull().default(0),
  byteSize: integer('byte_size').notNull().default(0),
  message: text('message'),
  // 'pending' | 'building' | 'success' | 'failed'
  status: text('status').notNull().default('pending'),
  // 'agent' | 'manual'
  triggeredBy: text('triggered_by').notNull().default('agent'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})


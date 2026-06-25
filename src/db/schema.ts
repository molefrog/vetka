import { pgTable, text, timestamp, boolean, uuid, uniqueIndex } from 'drizzle-orm/pg-core'

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
// Tangled / AT Protocol identity
// ---------------------------------------------------------------------------

export const tangledIdentity = pgTable('tangled_identity', {
  did: text('did').primaryKey(),
  handle: text('handle').notNull(),
  userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
  selectedRepoUri: text('selected_repo_uri'),
  selectedRepoName: text('selected_repo_name'),
  selectedRepoKnot: text('selected_repo_knot'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// ---------------------------------------------------------------------------
// Agent sessions — one persistent Anthropic Managed Agent session per user
// ---------------------------------------------------------------------------

export const agentSession = pgTable('agent_session', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' })
    .unique(),
  sessionId: text('session_id').notNull().unique(),
  sshPrivateKey: text('ssh_private_key'),
  sshPublicKey: text('ssh_public_key'),
  sshKeyFileId: text('ssh_key_file_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// ---------------------------------------------------------------------------
// Sites — the primary social entity (one per tangled identity or external domain)
// ---------------------------------------------------------------------------

export const site = pgTable('site', {
  id: uuid('id').primaryKey().defaultRandom(),
  domain: text('domain').notNull().unique(),
  userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
  isTangled: boolean('is_tangled').notNull().default(false),
  did: text('did').references(() => tangledIdentity.did, { onDelete: 'set null' }),
  repoUri: text('repo_uri'),
  repoName: text('repo_name'),
  repoKnot: text('repo_knot'),
  status: text('status').notNull().default('draft'), // draft | building | live | error
  buildLog: text('build_log'),
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


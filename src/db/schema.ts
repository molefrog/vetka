import { pgTable, text, timestamp, boolean, uuid } from 'drizzle-orm/pg-core'

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
// Linked to a better-auth user OR standalone (did is the primary identity)
// ---------------------------------------------------------------------------

export const tangledIdentity = pgTable('tangled_identity', {
  did: text('did').primaryKey(),
  handle: text('handle').notNull(),
  // null until user links to a better-auth account
  userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
  // the repo chosen at sign-in that the agent will deploy to
  selectedRepoUri: text('selected_repo_uri'),
  selectedRepoName: text('selected_repo_name'),
  selectedRepoKnot: text('selected_repo_knot'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// Tangled OAuth session tokens (managed by @atcute but mirrored here for server-side access)
export const tangledSession = pgTable('tangled_session', {
  id: uuid('id').primaryKey().defaultRandom(),
  did: text('did')
    .notNull()
    .references(() => tangledIdentity.did, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(), // hashed cookie token
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// ---------------------------------------------------------------------------
// Websites — one per user (regular) or per tangled identity
// ---------------------------------------------------------------------------

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
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// ---------------------------------------------------------------------------
// Websites
// ---------------------------------------------------------------------------

export const website = pgTable('website', {
  id: uuid('id').primaryKey().defaultRandom(),
  // regular user path
  userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
  // tangled user path
  did: text('did').references(() => tangledIdentity.did, { onDelete: 'cascade' }),
  // deployment target (tangled repo)
  repoUri: text('repo_uri'),
  repoName: text('repo_name'),
  repoKnot: text('repo_knot'),
  // custom domain (optional)
  domain: text('domain').unique(),
  status: text('status').notNull().default('draft'), // draft | building | live | error
  buildLog: text('build_log'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

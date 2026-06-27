-- Schema migration for removing Tangled and adding generated-site hosting.
--
-- The project syncs schema with `bunx drizzle-kit push` (interactive — run it in
-- a terminal and confirm the renames/drops below). This file is the equivalent
-- raw SQL for reference / non-interactive application:
--   psql "$DATABASE_URL" -f scripts/migrate-remove-tangled.sql
--
-- WARNING: destructive. Drops Tangled tables/columns and their data.

BEGIN;

-- 1. Tangled identity is gone entirely.
DROP TABLE IF EXISTS tangled_identity CASCADE;

-- 2. Agent sessions no longer carry SSH keys (deploys are storage-based).
ALTER TABLE agent_session
  DROP COLUMN IF EXISTS ssh_private_key,
  DROP COLUMN IF EXISTS ssh_public_key,
  DROP COLUMN IF EXISTS ssh_key_file_id;

-- 3. Sites: drop Tangled repo columns, add generated-site fields.
ALTER TABLE site
  DROP COLUMN IF EXISTS is_tangled,
  DROP COLUMN IF EXISTS did,
  DROP COLUMN IF EXISTS repo_uri,
  DROP COLUMN IF EXISTS repo_name,
  DROP COLUMN IF EXISTS repo_knot,
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'external',
  ADD COLUMN IF NOT EXISTS subdomain text,
  ADD COLUMN IF NOT EXISTS live_snapshot_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS site_subdomain_unique ON site (subdomain);

-- 4. Snapshots: replace git-commit columns with storage-backed version fields.
ALTER TABLE site_snapshot
  DROP COLUMN IF EXISTS commit_sha,
  DROP COLUMN IF EXISTS commit_message,
  DROP COLUMN IF EXISTS branch,
  ADD COLUMN IF NOT EXISTS storage_prefix text,
  ADD COLUMN IF NOT EXISTS file_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS byte_size integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS message text;

COMMIT;

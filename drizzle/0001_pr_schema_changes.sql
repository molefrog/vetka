-- Drop tangled_identity table (Tangled users now use better-auth sessions)
DROP TABLE IF EXISTS "tangled_identity" CASCADE;
--> statement-breakpoint

-- Remove SSH key columns from agent_session (deploy auth is now via session id)
ALTER TABLE "agent_session" DROP COLUMN IF EXISTS "ssh_private_key";
--> statement-breakpoint
ALTER TABLE "agent_session" DROP COLUMN IF EXISTS "ssh_public_key";
--> statement-breakpoint
ALTER TABLE "agent_session" DROP COLUMN IF EXISTS "ssh_key_file_id";
--> statement-breakpoint

-- Migrate site table: drop Tangled-specific columns, add generated-site columns
ALTER TABLE "site" DROP COLUMN IF EXISTS "is_tangled";
--> statement-breakpoint
ALTER TABLE "site" DROP COLUMN IF EXISTS "did";
--> statement-breakpoint
ALTER TABLE "site" DROP COLUMN IF EXISTS "repo_uri";
--> statement-breakpoint
ALTER TABLE "site" DROP COLUMN IF EXISTS "repo_name";
--> statement-breakpoint
ALTER TABLE "site" DROP COLUMN IF EXISTS "repo_knot";
--> statement-breakpoint
ALTER TABLE "site" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'external' NOT NULL;
--> statement-breakpoint
ALTER TABLE "site" ADD COLUMN IF NOT EXISTS "subdomain" text;
--> statement-breakpoint
ALTER TABLE "site" ADD CONSTRAINT "site_subdomain_unique" UNIQUE ("subdomain");
--> statement-breakpoint
ALTER TABLE "site" ADD COLUMN IF NOT EXISTS "live_snapshot_id" uuid;
--> statement-breakpoint

-- Migrate site_snapshot: drop git-based columns, add storage columns
ALTER TABLE "site_snapshot" DROP COLUMN IF EXISTS "commit_sha";
--> statement-breakpoint
ALTER TABLE "site_snapshot" DROP COLUMN IF EXISTS "commit_message";
--> statement-breakpoint
ALTER TABLE "site_snapshot" DROP COLUMN IF EXISTS "branch";
--> statement-breakpoint
ALTER TABLE "site_snapshot" ADD COLUMN IF NOT EXISTS "storage_prefix" text;
--> statement-breakpoint
ALTER TABLE "site_snapshot" ADD COLUMN IF NOT EXISTS "file_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "site_snapshot" ADD COLUMN IF NOT EXISTS "byte_size" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "site_snapshot" ADD COLUMN IF NOT EXISTS "message" text;

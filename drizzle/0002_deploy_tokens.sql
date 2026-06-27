-- Short-lived, per-site deploy tokens issued to the build agent via the
-- get_deploy_credentials custom tool and verified by POST /api/agent/deploy.
CREATE TABLE IF NOT EXISTS "deploy_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "deploy_token_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "deploy_token" ADD CONSTRAINT "deploy_token_site_id_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deploy_token_site" ON "deploy_token" USING btree ("site_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deploy_token_expires" ON "deploy_token" USING btree ("expires_at");

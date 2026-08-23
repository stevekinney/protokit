ALTER TABLE "oauth_authorization_transactions" ADD COLUMN "resource" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_codes" ADD COLUMN "resource" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_refresh_tokens" ADD COLUMN "resource" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_tokens" ADD COLUMN "resource" text DEFAULT '' NOT NULL;
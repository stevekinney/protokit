ALTER TABLE "oauth_clients" ALTER COLUMN "client_secret" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD COLUMN "application_type" text;--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD COLUMN "client_id_metadata_url" text;--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
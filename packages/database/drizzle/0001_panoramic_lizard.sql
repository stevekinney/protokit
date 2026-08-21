CREATE TABLE "oauth_authorization_transactions" (
	"transaction_id" text PRIMARY KEY NOT NULL,
	"csrf_token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"session_token_hash" text NOT NULL,
	"client_id" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"code_challenge" text NOT NULL,
	"code_challenge_method" text DEFAULT 'S256' NOT NULL,
	"state" text,
	"issuer" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "oauth_authorization_transactions" ADD CONSTRAINT "oauth_authorization_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_authorization_transactions" ADD CONSTRAINT "oauth_authorization_transactions_client_id_oauth_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("client_id") ON DELETE no action ON UPDATE no action;
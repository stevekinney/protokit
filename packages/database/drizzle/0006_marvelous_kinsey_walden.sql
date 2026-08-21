ALTER TABLE "oauth_authorization_transactions" DROP CONSTRAINT "oauth_authorization_transactions_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "oauth_authorization_transactions" DROP CONSTRAINT "oauth_authorization_transactions_client_id_oauth_clients_client_id_fk";
--> statement-breakpoint
ALTER TABLE "oauth_codes" DROP CONSTRAINT "oauth_codes_client_id_oauth_clients_client_id_fk";
--> statement-breakpoint
ALTER TABLE "oauth_codes" DROP CONSTRAINT "oauth_codes_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "oauth_refresh_tokens" DROP CONSTRAINT "oauth_refresh_tokens_client_id_oauth_clients_client_id_fk";
--> statement-breakpoint
ALTER TABLE "oauth_refresh_tokens" DROP CONSTRAINT "oauth_refresh_tokens_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "oauth_tokens" DROP CONSTRAINT "oauth_tokens_client_id_oauth_clients_client_id_fk";
--> statement-breakpoint
ALTER TABLE "oauth_tokens" DROP CONSTRAINT "oauth_tokens_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "user_google_accounts" DROP CONSTRAINT "user_google_accounts_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "user_sessions" DROP CONSTRAINT "user_sessions_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD COLUMN "client_secret_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "oauth_authorization_transactions" ADD CONSTRAINT "oauth_authorization_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_authorization_transactions" ADD CONSTRAINT "oauth_authorization_transactions_client_id_oauth_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_codes" ADD CONSTRAINT "oauth_codes_client_id_oauth_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_codes" ADD CONSTRAINT "oauth_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_refresh_tokens" ADD CONSTRAINT "oauth_refresh_tokens_client_id_oauth_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_refresh_tokens" ADD CONSTRAINT "oauth_refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_tokens" ADD CONSTRAINT "oauth_tokens_client_id_oauth_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_tokens" ADD CONSTRAINT "oauth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_google_accounts" ADD CONSTRAINT "user_google_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "oauth_authorization_transactions_expires_at_idx" ON "oauth_authorization_transactions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "oauth_codes_expires_at_idx" ON "oauth_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "oauth_refresh_tokens_expires_at_idx" ON "oauth_refresh_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "oauth_refresh_tokens_revoked_at_idx" ON "oauth_refresh_tokens" USING btree ("revoked_at");--> statement-breakpoint
CREATE INDEX "oauth_refresh_tokens_user_id_idx" ON "oauth_refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_tokens_expires_at_idx" ON "oauth_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "oauth_tokens_revoked_at_idx" ON "oauth_tokens" USING btree ("revoked_at");--> statement-breakpoint
CREATE INDEX "oauth_tokens_user_id_idx" ON "oauth_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_sessions_expires_at_idx" ON "user_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "user_sessions_revoked_at_idx" ON "user_sessions" USING btree ("revoked_at");
ALTER TABLE "account" DROP CONSTRAINT "account_role_check";--> statement-breakpoint
CREATE UNIQUE INDEX "account_single_admin_idx" ON "account" USING btree ("role") WHERE "account"."role" = 'admin';--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_role_check" CHECK ("account"."role" IN ('member', 'assistant', 'admin'));
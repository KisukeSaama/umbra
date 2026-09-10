CREATE TABLE "request_follower" (
	"request_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "request_follower_request_id_account_id_pk" PRIMARY KEY("request_id","account_id")
);
--> statement-breakpoint
ALTER TABLE "request_follower" ADD CONSTRAINT "request_follower_request_id_media_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."media_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_follower" ADD CONSTRAINT "request_follower_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "request_follower_account_idx" ON "request_follower" USING btree ("account_id");--> statement-breakpoint
-- Whoever opened a request was already waiting on it: they become its first
-- follower, dated from the request itself.
INSERT INTO "request_follower" ("request_id", "account_id", "created_at")
SELECT "id", "requested_by", "created_at"
  FROM "media_request"
 WHERE "requested_by" IS NOT NULL
ON CONFLICT DO NOTHING;
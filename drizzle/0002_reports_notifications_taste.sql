CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"subject_id" uuid,
	"dedup_key" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "notification_kind_check" CHECK ("notification"."kind" IN ('request_status', 'report_status', 'announcement', 'poll_open', 'episode_available'))
);
--> statement-breakpoint
CREATE TABLE "report_follower" (
	"report_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_follower_report_id_account_id_pk" PRIMARY KEY("report_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_id" uuid NOT NULL,
	"reported_by" uuid,
	"season_number" integer,
	"episode_number" integer,
	"library_rating_key" text,
	"reason" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	CONSTRAINT "report_scope_check" CHECK ("report"."episode_number" IS NULL OR "report"."season_number" IS NOT NULL),
	CONSTRAINT "report_reason_check" CHECK ("report"."reason" IN ('missing_episode', 'missing_season', 'series_outdated', 'wrong_content', 'bad_quality', 'missing_audio_track', 'missing_subtitles', 'playback_error', 'duplicate_entry', 'wrong_order')),
	CONSTRAINT "report_status_check" CHECK ("report"."status" IN ('open', 'acknowledged', 'in_progress', 'resolved', 'rejected', 'duplicate'))
);
--> statement-breakpoint
CREATE TABLE "taste_profile" (
	"account_id" uuid NOT NULL,
	"media_kind" text NOT NULL,
	"genre_id" integer NOT NULL,
	"weight" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "taste_profile_account_id_media_kind_genre_id_pk" PRIMARY KEY("account_id","media_kind","genre_id"),
	CONSTRAINT "taste_profile_kind_check" CHECK ("taste_profile"."media_kind" IN ('movie', 'tv'))
);
--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "personalisation_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "library_item" ADD COLUMN "genre_ids" integer[];--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_follower" ADD CONSTRAINT "report_follower_report_id_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_follower" ADD CONSTRAINT "report_follower_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_reported_by_account_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taste_profile" ADD CONSTRAINT "taste_profile_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_unique_idx" ON "notification" USING btree ("account_id","dedup_key");--> statement-breakpoint
CREATE INDEX "notification_account_idx" ON "notification" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "notification_unread_idx" ON "notification" USING btree ("account_id") WHERE read_at IS NULL;--> statement-breakpoint
CREATE INDEX "notification_subject_idx" ON "notification" USING btree ("subject_id","created_at");--> statement-breakpoint
CREATE INDEX "report_follower_account_idx" ON "report_follower" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "report_active_idx" ON "report" USING btree ("media_id",(coalesce("season_number", -1)),(coalesce("episode_number", -1)),"reason") WHERE status NOT IN ('resolved', 'rejected', 'duplicate');--> statement-breakpoint
CREATE INDEX "report_status_idx" ON "report" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "report_media_idx" ON "report" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "report_live_idx" ON "report" USING btree ("status","reason");--> statement-breakpoint
CREATE INDEX "taste_profile_weight_idx" ON "taste_profile" USING btree ("account_id","weight");
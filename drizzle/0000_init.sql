CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plex_account_id" text NOT NULL,
	"username" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_plex_account_id_unique" UNIQUE("plex_account_id"),
	CONSTRAINT "account_role_check" CHECK ("account"."role" IN ('member', 'admin')),
	CONSTRAINT "account_status_check" CHECK ("account"."status" IN ('pending', 'approved', 'blocked'))
);
--> statement-breakpoint
CREATE TABLE "analytics_daily" (
	"day" date NOT NULL,
	"metric" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "analytics_daily_day_metric_pk" PRIMARY KEY("day","metric")
);
--> statement-breakpoint
CREATE TABLE "announcement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"category" text DEFAULT 'information' NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "announcement_category_check" CHECK ("announcement"."category" IN ('information', 'infrastructure', 'content', 'update', 'storage', 'funding'))
);
--> statement-breakpoint
CREATE TABLE "auth_pin" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plex_pin_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "episode_task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" uuid NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "episode_task_episode_id_unique" UNIQUE("episode_id"),
	CONSTRAINT "episode_task_status_check" CHECK ("episode_task"."status" IN ('open', 'done', 'dismissed'))
);
--> statement-breakpoint
CREATE TABLE "episode" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"series_id" uuid NOT NULL,
	"season_number" integer NOT NULL,
	"episode_number" integer NOT NULL,
	"provider_episode_id" text,
	"title" text,
	"air_date" date,
	"plex_available" boolean DEFAULT false NOT NULL,
	"plex_checked_at" timestamp with time zone,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "episode_status_check" CHECK ("episode"."status" IN ('scheduled', 'aired_missing', 'available'))
);
--> statement-breakpoint
CREATE TABLE "funding_goal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"target_amount_cents" bigint NOT NULL,
	"current_amount_cents" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "funding_goal_target_check" CHECK ("funding_goal"."target_amount_cents" > 0),
	CONSTRAINT "funding_goal_status_check" CHECK ("funding_goal"."status" IN ('draft', 'active', 'completed', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "funding_transaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"delta_cents" bigint NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_name" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"items_processed" integer DEFAULT 0 NOT NULL,
	"error" text,
	CONSTRAINT "job_run_status_check" CHECK ("job_run"."status" IN ('running', 'success', 'failure'))
);
--> statement-breakpoint
CREATE TABLE "job_state" (
	"job_name" text PRIMARY KEY NOT NULL,
	"last_success_at" timestamp with time zone,
	"cursor" jsonb
);
--> statement-breakpoint
CREATE TABLE "library_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rating_key" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"year" integer,
	"tmdb_id" text,
	"tvdb_id" text,
	"imdb_id" text,
	"parent_rating_key" text,
	"grandparent_rating_key" text,
	"grandparent_title" text,
	"season_number" integer,
	"episode_number" integer,
	"section_key" text,
	"poster_path" text,
	"added_at" timestamp with time zone,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "library_item_rating_key_unique" UNIQUE("rating_key"),
	CONSTRAINT "library_item_kind_check" CHECK ("library_item"."kind" IN ('movie', 'show', 'season', 'episode'))
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text DEFAULT 'tmdb' NOT NULL,
	"provider_id" text NOT NULL,
	"media_type" text NOT NULL,
	"title" text NOT NULL,
	"original_title" text,
	"overview" text,
	"release_date" date,
	"poster_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_type_check" CHECK ("media"."media_type" IN ('movie', 'tv'))
);
--> statement-breakpoint
CREATE TABLE "media_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_id" uuid NOT NULL,
	"requested_by" uuid,
	"status" text DEFAULT 'requested' NOT NULL,
	"admin_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_request_status_check" CHECK ("media_request"."status" IN ('requested', 'accepted', 'processing', 'available', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "poll_option" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_id" uuid NOT NULL,
	"label" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "poll" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question" text NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "session_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "storage_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"total_bytes" bigint NOT NULL,
	"used_bytes" bigint NOT NULL,
	"available_bytes" bigint NOT NULL,
	"volumes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracked_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_id" uuid NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"provider_status" text,
	"plex_rating_key" text,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tracked_series_media_id_unique" UNIQUE("media_id")
);
--> statement-breakpoint
CREATE TABLE "vote" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "episode_task" ADD CONSTRAINT "episode_task_episode_id_episode_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episode"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode" ADD CONSTRAINT "episode_series_id_tracked_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."tracked_series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funding_transaction" ADD CONSTRAINT "funding_transaction_goal_id_funding_goal_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."funding_goal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_request" ADD CONSTRAINT "media_request_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_request" ADD CONSTRAINT "media_request_requested_by_account_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_option" ADD CONSTRAINT "poll_option_poll_id_poll_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."poll"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_series" ADD CONSTRAINT "tracked_series_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vote" ADD CONSTRAINT "vote_poll_id_poll_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."poll"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vote" ADD CONSTRAINT "vote_option_id_poll_option_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."poll_option"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vote" ADD CONSTRAINT "vote_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "announcement_published_idx" ON "announcement" USING btree ("published","published_at");--> statement-breakpoint
CREATE INDEX "episode_task_status_idx" ON "episode_task" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "episode_unique_idx" ON "episode" USING btree ("series_id","season_number","episode_number");--> statement-breakpoint
CREATE INDEX "episode_air_date_idx" ON "episode" USING btree ("air_date");--> statement-breakpoint
CREATE INDEX "episode_status_idx" ON "episode" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "funding_goal_single_active_idx" ON "funding_goal" USING btree ("status") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "funding_transaction_goal_idx" ON "funding_transaction" USING btree ("goal_id","created_at");--> statement-breakpoint
CREATE INDEX "job_run_name_idx" ON "job_run" USING btree ("job_name","started_at");--> statement-breakpoint
CREATE INDEX "library_item_tmdb_idx" ON "library_item" USING btree ("tmdb_id","kind");--> statement-breakpoint
CREATE INDEX "library_item_added_idx" ON "library_item" USING btree ("added_at");--> statement-breakpoint
CREATE INDEX "library_item_episode_idx" ON "library_item" USING btree ("grandparent_rating_key","season_number","episode_number");--> statement-breakpoint
CREATE UNIQUE INDEX "media_provider_idx" ON "media" USING btree ("provider","media_type","provider_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_request_active_idx" ON "media_request" USING btree ("media_id") WHERE status <> 'rejected';--> statement-breakpoint
CREATE INDEX "media_request_status_idx" ON "media_request" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "poll_option_poll_idx" ON "poll_option" USING btree ("poll_id","position");--> statement-breakpoint
CREATE INDEX "session_account_idx" ON "session" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "session_expires_idx" ON "session" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "storage_snapshot_recorded_idx" ON "storage_snapshot" USING btree ("recorded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "vote_unique_idx" ON "vote" USING btree ("poll_id","account_id");
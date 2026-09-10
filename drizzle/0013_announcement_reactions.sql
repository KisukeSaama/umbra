CREATE TABLE "announcement_reaction" (
	"announcement_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "announcement_reaction_announcement_id_account_id_pk" PRIMARY KEY("announcement_id","account_id"),
	CONSTRAINT "announcement_reaction_value_check" CHECK ("announcement_reaction"."value" IN ('like', 'dislike'))
);
--> statement-breakpoint
ALTER TABLE "announcement_reaction" ADD CONSTRAINT "announcement_reaction_announcement_id_announcement_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_reaction" ADD CONSTRAINT "announcement_reaction_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;
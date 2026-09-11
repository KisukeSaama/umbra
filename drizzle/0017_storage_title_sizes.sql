-- What a film and an episode typically weigh, worked out when the disk is
-- walked, so the storage card can count the free space in titles. See
-- docs/adr/0019-storage-speaks-in-titles.md.
ALTER TABLE "storage_tree_snapshot" ADD COLUMN "movie_bytes" bigint;--> statement-breakpoint
ALTER TABLE "storage_tree_snapshot" ADD COLUMN "episode_bytes" bigint;
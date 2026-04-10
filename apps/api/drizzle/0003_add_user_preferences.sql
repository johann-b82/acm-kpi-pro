ALTER TABLE "users" ADD COLUMN "theme" text NOT NULL DEFAULT 'system';
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locale" text NOT NULL DEFAULT 'de';

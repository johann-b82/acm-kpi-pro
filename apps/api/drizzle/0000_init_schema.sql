CREATE TABLE "imports" (
	"id" serial PRIMARY KEY NOT NULL,
	"filename" text NOT NULL,
	"row_count" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"operator" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_rows" (
	"id" serial PRIMARY KEY NOT NULL,
	"import_id" integer,
	"article_number" text,
	"warehouse" text,
	"quantity" numeric(18, 4),
	"value" numeric(18, 2),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"ldap_dn" text NOT NULL,
	"username" text NOT NULL,
	"email" text,
	"role" text DEFAULT 'Viewer' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_ldap_dn_unique" UNIQUE("ldap_dn")
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_rows" ADD CONSTRAINT "stock_rows_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_imports_status" ON "imports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_imports_created_at" ON "imports" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_stock_rows_import" ON "stock_rows" USING btree ("import_id");--> statement-breakpoint
CREATE INDEX "idx_stock_rows_article" ON "stock_rows" USING btree ("article_number");
-- Phase 2: Expand stock_rows to full 52-column LagBes schema
-- Adds stock_rows_staging permanent table for atomic swap pattern
-- Extends imports table with source, started_at, finished_at
-- Note: drizzle-kit 0.31.x requires a TTY terminal for interactive column-rename
-- prompts (triggered when renaming placeholder columns). This migration was
-- generated with drizzle-kit's output for the staging table + enum, then extended
-- with the stock_rows ALTER statements. Verified correct by build + snapshot check.

CREATE TYPE "public"."article_type" AS ENUM('ART', 'MAT', 'HLB', 'WKZ');
--> statement-breakpoint
ALTER TABLE "imports" ADD COLUMN "source" text DEFAULT 'cli' NOT NULL;
--> statement-breakpoint
ALTER TABLE "imports" ADD COLUMN "started_at" timestamp;
--> statement-breakpoint
ALTER TABLE "imports" ADD COLUMN "finished_at" timestamp;
--> statement-breakpoint
ALTER TABLE "stock_rows" DROP CONSTRAINT IF EXISTS "stock_rows_import_id_imports_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "idx_stock_rows_article";
--> statement-breakpoint
ALTER TABLE "stock_rows" DROP COLUMN IF EXISTS "article_number";
--> statement-breakpoint
ALTER TABLE "stock_rows" DROP COLUMN IF EXISTS "warehouse";
--> statement-breakpoint
ALTER TABLE "stock_rows" DROP COLUMN IF EXISTS "quantity";
--> statement-breakpoint
ALTER TABLE "stock_rows" DROP COLUMN IF EXISTS "value";
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "artikelnr" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "stock_rows" ALTER COLUMN "artikelnr" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "typ" "article_type" NOT NULL DEFAULT 'ART'::"article_type";
--> statement-breakpoint
ALTER TABLE "stock_rows" ALTER COLUMN "typ" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "bezeichnung_1" text;
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "bezeichnung_2" text;
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "bezeichnung_3" text;
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "bezeichnung_4" text;
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "bezeichnung_5" text;
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "bezeichnung_6" text;
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "wgr" text;
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "prodgrp" text;
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "wareneingangskonto" text;
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "bestandskonto" text;
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "lagername" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "stock_rows" ALTER COLUMN "lagername" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "bestand_lagereinheit" numeric(18, 4);
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "lag_einh" text;
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "bestand_basiseinheit" numeric(18, 4);
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "einh" text;
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "preis" numeric(18, 4);
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "pro_menge" integer;
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "wert" numeric(18, 2);
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "abwert_prozent" numeric(5, 2);
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "wert_mit_abw" numeric(18, 2);
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "durch_verbr" numeric(18, 4);
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "reichw_mon" numeric(10, 2);
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "letzt_zugang" date;
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "letzt_zugang_fa" date;
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "stammlager" text;
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "stammstellplatz" text;
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "umsatz_me_j" numeric(18, 4);
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "umsatz_me_vj" numeric(18, 4);
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "lieferant" text;
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "lagerb_d" numeric(18, 4);
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "auftrag_m" numeric(18, 4);
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "reserv_m" numeric(18, 4);
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "bestell_m" numeric(18, 4);
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "fa_menge" numeric(18, 4);
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "bedarf_m" numeric(18, 4);
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "o_verbrauch_m" numeric(18, 4);
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "l_ek_am" date;
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "produktgruppe" text;
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "stm_uni_a01" text;
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "lagerzugang_dat" date;
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "lagerabgang_dat" date;
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "lagerabgang_letztes_jahr" numeric(18, 4);
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "lagerabgang_letztes_12_jahr" numeric(18, 4);
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "lagerzugang_letztes_12_jahr" numeric(18, 4);
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "geloescht" text DEFAULT 'N' NOT NULL;
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "erf_datum" date;
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "eingrenzung_von" text;
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "eingrenzung_bis" text;
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "inventurgruppe" text;
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "abc_kennz_vk" text;
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD COLUMN "raw_row" text;
--> statement-breakpoint
ALTER TABLE "stock_rows" ADD CONSTRAINT "stock_rows_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_stock_rows_artikelnr" ON "stock_rows" USING btree ("artikelnr");
--> statement-breakpoint
CREATE INDEX "idx_stock_rows_lagername" ON "stock_rows" USING btree ("lagername");
--> statement-breakpoint
CREATE INDEX "idx_stock_rows_typ" ON "stock_rows" USING btree ("typ");
--> statement-breakpoint
CREATE INDEX "idx_stock_rows_abc" ON "stock_rows" USING btree ("abc_kennz_vk");
--> statement-breakpoint
CREATE TABLE "stock_rows_staging" (
	"id" serial PRIMARY KEY NOT NULL,
	"import_id" integer,
	"artikelnr" text NOT NULL,
	"typ" "article_type" NOT NULL,
	"bezeichnung_1" text,
	"bezeichnung_2" text,
	"bezeichnung_3" text,
	"bezeichnung_4" text,
	"bezeichnung_5" text,
	"bezeichnung_6" text,
	"wgr" text,
	"prodgrp" text,
	"wareneingangskonto" text,
	"bestandskonto" text,
	"lagername" text NOT NULL,
	"bestand_lagereinheit" numeric(18, 4),
	"lag_einh" text,
	"bestand_basiseinheit" numeric(18, 4),
	"einh" text,
	"preis" numeric(18, 4),
	"pro_menge" integer,
	"wert" numeric(18, 2),
	"abwert_prozent" numeric(5, 2),
	"wert_mit_abw" numeric(18, 2),
	"durch_verbr" numeric(18, 4),
	"reichw_mon" numeric(10, 2),
	"letzt_zugang" date,
	"letzt_zugang_fa" date,
	"stammlager" text,
	"stammstellplatz" text,
	"umsatz_me_j" numeric(18, 4),
	"umsatz_me_vj" numeric(18, 4),
	"lieferant" text,
	"lagerb_d" numeric(18, 4),
	"auftrag_m" numeric(18, 4),
	"reserv_m" numeric(18, 4),
	"bestell_m" numeric(18, 4),
	"fa_menge" numeric(18, 4),
	"bedarf_m" numeric(18, 4),
	"o_verbrauch_m" numeric(18, 4),
	"l_ek_am" date,
	"produktgruppe" text,
	"stm_uni_a01" text,
	"lagerzugang_dat" date,
	"lagerabgang_dat" date,
	"lagerabgang_letztes_jahr" numeric(18, 4),
	"lagerabgang_letztes_12_jahr" numeric(18, 4),
	"lagerzugang_letztes_12_jahr" numeric(18, 4),
	"geloescht" text DEFAULT 'N' NOT NULL,
	"erf_datum" date,
	"eingrenzung_von" text,
	"eingrenzung_bis" text,
	"inventurgruppe" text,
	"abc_kennz_vk" text,
	"raw_row" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);

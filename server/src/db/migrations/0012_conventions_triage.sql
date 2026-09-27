CREATE TABLE "convention_scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"repo_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"sample_files" jsonb NOT NULL,
	"proposed" integer NOT NULL,
	"dropped" integer NOT NULL,
	"skipped" integer NOT NULL,
	"cost_usd" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "category" text DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "evidence_line_start" integer;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "evidence_line_end" integer;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "convention_scans" ADD CONSTRAINT "convention_scans_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convention_scans" ADD CONSTRAINT "convention_scans_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "convention_scans_repo_created_idx" ON "convention_scans" USING btree ("repo_id","created_at");--> statement-breakpoint
CREATE INDEX "convention_scans_ws_idx" ON "convention_scans" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "conventions_repo_status_idx" ON "conventions" USING btree ("repo_id","status");--> statement-breakpoint
CREATE INDEX "conventions_ws_idx" ON "conventions" USING btree ("workspace_id");--> statement-breakpoint
ALTER TABLE "conventions" ADD CONSTRAINT "conventions_status_check" CHECK ("conventions"."status" IN ('pending', 'accepted', 'rejected'));--> statement-breakpoint
ALTER TABLE "conventions" ADD CONSTRAINT "conventions_confidence_check" CHECK ("conventions"."confidence" IS NULL OR ("conventions"."confidence" >= 0 AND "conventions"."confidence" <= 1));
ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'auditor';
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'auth_event_type') THEN
    CREATE TYPE "public"."auth_event_type" AS ENUM(
      'LOGIN_SUCCESS',
      'LOGIN_FAILURE',
      'LOGIN_BLOCKED',
      'PASSWORD_CHANGE',
      'PASSWORD_RESET'
    );
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_log" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer,
  "login_informado" varchar(120),
  "login_normalizado" varchar(120),
  "ip_address" varchar(120),
  "evento" "auth_event_type" NOT NULL,
  "detalhe" text,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'auth_log_user_id_users_id_fk'
      AND table_name = 'auth_log'
  ) THEN
    ALTER TABLE "auth_log"
      ADD CONSTRAINT "auth_log_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
      ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_log_user_idx" ON "auth_log" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_log_login_idx" ON "auth_log" USING btree ("login_normalizado");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_log_evento_idx" ON "auth_log" USING btree ("evento");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_log_criado_em_idx" ON "auth_log" USING btree ("criado_em");

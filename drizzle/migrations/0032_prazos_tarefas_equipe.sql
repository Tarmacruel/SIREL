DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tarefa_equipe_status') THEN
    CREATE TYPE "public"."tarefa_equipe_status" AS ENUM(
      'PENDENTE',
      'EM_ANDAMENTO',
      'AGUARDANDO',
      'BLOQUEADO',
      'CONCLUIDO'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tarefa_equipe_prioridade') THEN
    CREATE TYPE "public"."tarefa_equipe_prioridade" AS ENUM('BAIXA', 'MEDIA', 'ALTA');
  END IF;
END
$$;

ALTER TABLE "prazos_processuais"
ADD COLUMN IF NOT EXISTS "responsavel_id" integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'prazos_processuais_responsavel_id_users_id_fk'
      AND table_name = 'prazos_processuais'
  ) THEN
    ALTER TABLE "prazos_processuais"
      ADD CONSTRAINT "prazos_processuais_responsavel_id_users_id_fk"
      FOREIGN KEY ("responsavel_id")
      REFERENCES "public"."users"("id")
      ON DELETE set null;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "prazos_processuais_responsavel_idx"
ON "prazos_processuais" USING btree ("responsavel_id");

CREATE TABLE IF NOT EXISTS "tarefas_equipe" (
  "id" serial PRIMARY KEY NOT NULL,
  "processo_id" integer,
  "prazo_id" integer,
  "titulo" varchar(200) NOT NULL,
  "descricao" text,
  "data_entrega" date NOT NULL,
  "prioridade" "tarefa_equipe_prioridade" DEFAULT 'MEDIA' NOT NULL,
  "status" "tarefa_equipe_status" DEFAULT 'PENDENTE' NOT NULL,
  "delegado_por_id" integer,
  "responsavel_id" integer NOT NULL,
  "notificar_responsavel" boolean DEFAULT true NOT NULL,
  "concluida_em" timestamp with time zone,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'tarefas_equipe_processo_id_processos_id_fk'
      AND table_name = 'tarefas_equipe'
  ) THEN
    ALTER TABLE "tarefas_equipe"
      ADD CONSTRAINT "tarefas_equipe_processo_id_processos_id_fk"
      FOREIGN KEY ("processo_id")
      REFERENCES "public"."processos"("id")
      ON DELETE set null;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'tarefas_equipe_prazo_id_prazos_processuais_id_fk'
      AND table_name = 'tarefas_equipe'
  ) THEN
    ALTER TABLE "tarefas_equipe"
      ADD CONSTRAINT "tarefas_equipe_prazo_id_prazos_processuais_id_fk"
      FOREIGN KEY ("prazo_id")
      REFERENCES "public"."prazos_processuais"("id")
      ON DELETE set null;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'tarefas_equipe_delegado_por_id_users_id_fk'
      AND table_name = 'tarefas_equipe'
  ) THEN
    ALTER TABLE "tarefas_equipe"
      ADD CONSTRAINT "tarefas_equipe_delegado_por_id_users_id_fk"
      FOREIGN KEY ("delegado_por_id")
      REFERENCES "public"."users"("id")
      ON DELETE set null;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'tarefas_equipe_responsavel_id_users_id_fk'
      AND table_name = 'tarefas_equipe'
  ) THEN
    ALTER TABLE "tarefas_equipe"
      ADD CONSTRAINT "tarefas_equipe_responsavel_id_users_id_fk"
      FOREIGN KEY ("responsavel_id")
      REFERENCES "public"."users"("id");
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "tarefas_equipe_processo_idx"
ON "tarefas_equipe" USING btree ("processo_id");

CREATE INDEX IF NOT EXISTS "tarefas_equipe_prazo_idx"
ON "tarefas_equipe" USING btree ("prazo_id");

CREATE INDEX IF NOT EXISTS "tarefas_equipe_status_idx"
ON "tarefas_equipe" USING btree ("status");

CREATE INDEX IF NOT EXISTS "tarefas_equipe_prioridade_idx"
ON "tarefas_equipe" USING btree ("prioridade");

CREATE INDEX IF NOT EXISTS "tarefas_equipe_responsavel_idx"
ON "tarefas_equipe" USING btree ("responsavel_id");

CREATE INDEX IF NOT EXISTS "tarefas_equipe_data_entrega_idx"
ON "tarefas_equipe" USING btree ("data_entrega");

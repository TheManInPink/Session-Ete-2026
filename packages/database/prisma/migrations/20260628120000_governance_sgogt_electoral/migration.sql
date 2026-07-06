-- Migration: governance-service Bloc C2/C3 (SGOGT signé + directives Kanban + intégrité électorale)
-- ADDITIVE : ne modifie aucun objet existant hors l'ajout de `users.manager_id`
-- (self-relation hiérarchique pour l'escalade SGOGT).
--
-- ⚠️ Rédigée à la main (diff Prisma indisponible sans shadow DB en dev). À
-- valider via `prisma migrate dev` une fois la DB de dev à jour. Conforme aux
-- @@map/@map du schéma (snake_case).

-- ── ENUMS ────────────────────────────────────────────────────────────────────
CREATE TYPE "sgogt_priority" AS ENUM ('NORMAL', 'HIGH', 'CRITICAL');
CREATE TYPE "sgogt_status" AS ENUM ('SENT', 'READ', 'RESPONDED', 'ESCALATED', 'ARCHIVED');
CREATE TYPE "governance_task_status" AS ENUM ('DRAFT', 'SENT', 'IN_PROGRESS', 'COMPLETED', 'REJECTED');
CREATE TYPE "voter_inscription_type" AS ENUM ('AUTO_18', 'MANUAL', 'TRANSFER');
CREATE TYPE "voter_status" AS ENUM ('ACTIVE', 'REMOVED_DECEASED', 'REMOVED_RELOCATED', 'REMOVED_DISQUALIFIED');

-- ── USERS : self-relation hiérarchique (manager) ─────────────────────────────
ALTER TABLE "users" ADD COLUMN "manager_id" UUID;
CREATE INDEX "users_manager_id_idx" ON "users" ("manager_id");
ALTER TABLE "users"
  ADD CONSTRAINT "users_manager_id_fkey"
  FOREIGN KEY ("manager_id") REFERENCES "users" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── SGOGT_SIGNED_MESSAGES ────────────────────────────────────────────────────
CREATE TABLE "sgogt_signed_messages" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "thread_id" UUID NOT NULL,
  "sender_id" UUID NOT NULL,
  "recipient_id" UUID NOT NULL,
  "subject" VARCHAR(300) NOT NULL,
  "body" TEXT NOT NULL,
  "body_hash" VARCHAR(64) NOT NULL,
  "jws_signature" TEXT NOT NULL,
  "signed_claims" JSONB NOT NULL,
  "signing_kid" VARCHAR(120) NOT NULL,
  "priority" "sgogt_priority" NOT NULL DEFAULT 'NORMAL',
  "status" "sgogt_status" NOT NULL DEFAULT 'SENT',
  "ttl_escalate_at" TIMESTAMPTZ(6) NOT NULL,
  "escalated_to_id" UUID,
  "escalated_at" TIMESTAMPTZ(6),
  "read_at" TIMESTAMPTZ(6),
  "responded_at" TIMESTAMPTZ(6),
  "read_receipt_jws" TEXT,
  "previous_chain_hash" VARCHAR(64) NOT NULL,
  "chain_hash" VARCHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "sgogt_signed_messages_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sgogt_signed_messages_chain_hash_key" ON "sgogt_signed_messages" ("chain_hash");
CREATE INDEX "sgogt_signed_messages_recipient_id_status_idx" ON "sgogt_signed_messages" ("recipient_id", "status");
CREATE INDEX "sgogt_signed_messages_thread_id_idx" ON "sgogt_signed_messages" ("thread_id");
CREATE INDEX "sgogt_signed_messages_status_ttl_escalate_at_idx" ON "sgogt_signed_messages" ("status", "ttl_escalate_at");
ALTER TABLE "sgogt_signed_messages"
  ADD CONSTRAINT "sgogt_signed_messages_sender_id_fkey"
  FOREIGN KEY ("sender_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sgogt_signed_messages"
  ADD CONSTRAINT "sgogt_signed_messages_recipient_id_fkey"
  FOREIGN KEY ("recipient_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── SGOGT_ESCALATION_EVENTS ──────────────────────────────────────────────────
CREATE TABLE "sgogt_escalation_events" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "message_id" UUID NOT NULL,
  "from_user_id" UUID NOT NULL,
  "to_user_id" UUID NOT NULL,
  "level" INTEGER NOT NULL DEFAULT 1,
  "reason" VARCHAR(40) NOT NULL DEFAULT 'TTL_EXPIRED',
  "signature_jws" TEXT NOT NULL,
  "previous_hash" VARCHAR(64) NOT NULL,
  "chain_hash" VARCHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "sgogt_escalation_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sgogt_escalation_events_chain_hash_key" ON "sgogt_escalation_events" ("chain_hash");
CREATE INDEX "sgogt_escalation_events_message_id_idx" ON "sgogt_escalation_events" ("message_id");
CREATE INDEX "sgogt_escalation_events_to_user_id_idx" ON "sgogt_escalation_events" ("to_user_id");
ALTER TABLE "sgogt_escalation_events"
  ADD CONSTRAINT "sgogt_escalation_events_message_id_fkey"
  FOREIGN KEY ("message_id") REFERENCES "sgogt_signed_messages" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── GOVERNANCE_TASKS (Kanban) ────────────────────────────────────────────────
CREATE TABLE "governance_tasks" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "title" VARCHAR(300) NOT NULL,
  "description" TEXT NOT NULL,
  "status" "governance_task_status" NOT NULL DEFAULT 'DRAFT',
  "created_by_id" UUID NOT NULL,
  "assignee_id" UUID,
  "priority" "sgogt_priority" NOT NULL DEFAULT 'NORMAL',
  "deadline" TIMESTAMPTZ(6),
  "escalation_level" INTEGER NOT NULL DEFAULT 0,
  "rejection_reason" TEXT,
  "completed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "governance_tasks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "governance_tasks_status_idx" ON "governance_tasks" ("status");
CREATE INDEX "governance_tasks_assignee_id_idx" ON "governance_tasks" ("assignee_id");
CREATE INDEX "governance_tasks_created_by_id_idx" ON "governance_tasks" ("created_by_id");
ALTER TABLE "governance_tasks"
  ADD CONSTRAINT "governance_tasks_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "governance_tasks"
  ADD CONSTRAINT "governance_tasks_assignee_id_fkey"
  FOREIGN KEY ("assignee_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── GOVERNANCE_TASK_EVENTS ───────────────────────────────────────────────────
CREATE TABLE "governance_task_events" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "task_id" UUID NOT NULL,
  "from_status" "governance_task_status",
  "to_status" "governance_task_status" NOT NULL,
  "actor_id" VARCHAR(100) NOT NULL,
  "note" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "governance_task_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "governance_task_events_task_id_idx" ON "governance_task_events" ("task_id");
ALTER TABLE "governance_task_events"
  ADD CONSTRAINT "governance_task_events_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "governance_tasks" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── ELECTORAL_PSEUDONYMS (registre pseudonymisé) ─────────────────────────────
CREATE TABLE "electoral_pseudonyms" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "citizen_id" UUID NOT NULL,
  "pseudonymous_id" VARCHAR(128) NOT NULL,
  "salt_version" INTEGER NOT NULL,
  "region" VARCHAR(100) NOT NULL,
  "cercle" VARCHAR(100) NOT NULL,
  "commune" VARCHAR(100),
  "inscription_type" "voter_inscription_type" NOT NULL DEFAULT 'AUTO_18',
  "status" "voter_status" NOT NULL DEFAULT 'ACTIVE',
  "registered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "removed_at" TIMESTAMPTZ(6),
  "removed_reason" VARCHAR(120),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "electoral_pseudonyms_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "electoral_pseudonyms_citizen_id_key" ON "electoral_pseudonyms" ("citizen_id");
CREATE UNIQUE INDEX "electoral_pseudonyms_pseudonymous_id_key" ON "electoral_pseudonyms" ("pseudonymous_id");
CREATE INDEX "electoral_pseudonyms_region_status_idx" ON "electoral_pseudonyms" ("region", "status");
CREATE INDEX "electoral_pseudonyms_pseudonymous_id_idx" ON "electoral_pseudonyms" ("pseudonymous_id");
CREATE INDEX "electoral_pseudonyms_registered_at_idx" ON "electoral_pseudonyms" ("registered_at");
CREATE INDEX "electoral_pseudonyms_removed_at_idx" ON "electoral_pseudonyms" ("removed_at");
ALTER TABLE "electoral_pseudonyms"
  ADD CONSTRAINT "electoral_pseudonyms_citizen_id_fkey"
  FOREIGN KEY ("citizen_id") REFERENCES "citizens" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── DGE_EXPORT_QUOTA (quota atomique par compte) ─────────────────────────────
CREATE TABLE "dge_export_quota" (
  "account_id" VARCHAR(100) NOT NULL,
  "day" VARCHAR(10) NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "dge_export_quota_pkey" PRIMARY KEY ("account_id", "day")
);

-- ── ELECTORAL_EXPORT_LOGS (journal local des exports DGE) ────────────────────
CREATE TABLE "electoral_export_logs" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "account_id" VARCHAR(100) NOT NULL,
  "since_iso" VARCHAR(40) NOT NULL,
  "row_count" INTEGER NOT NULL,
  "sha256" VARCHAR(64) NOT NULL,
  "salt_version" INTEGER NOT NULL,
  "ip_address" VARCHAR(45),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "electoral_export_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "electoral_export_logs_account_id_idx" ON "electoral_export_logs" ("account_id");
CREATE INDEX "electoral_export_logs_created_at_idx" ON "electoral_export_logs" ("created_at");

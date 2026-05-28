-- ═══════════════════════════════════════════════════════════════════
-- Migration document_service_models — Doc 10 v2.0 (PROMPT 3.3 phase 2/10)
-- Adds: Document, DocumentRevocation, DocumentAccessLog + 4 enums + triggers
-- append-only sur document_revocations (intégrité forensique).
-- ═══════════════════════════════════════════════════════════════════

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('FICHE_DESCRIPTIVE', 'EXTRAIT_NAISSANCE', 'CERTIFICAT_NATIONALITE');

-- CreateEnum
CREATE TYPE "DocumentRevocationReason" AS ENUM ('DECEASED', 'FRAUD_DETECTED', 'DATA_CORRECTION', 'CITIZEN_REQUEST', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentAccessAction" AS ENUM ('DOWNLOAD', 'VERIFY_QR');

-- CreateEnum
CREATE TYPE "DocumentAccessResult" AS ENUM ('SUCCESS', 'FAILURE');

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "jti" UUID NOT NULL,
    "nina" VARCHAR(15) NOT NULL,
    "type" "DocumentType" NOT NULL DEFAULT 'FICHE_DESCRIPTIVE',
    "serial_number" VARCHAR(32) NOT NULL,
    "language" VARCHAR(3) NOT NULL,
    "sha256_html" VARCHAR(64) NOT NULL,
    "sha256_pdf" VARCHAR(64) NOT NULL,
    "kid" VARCHAR(64) NOT NULL,
    "minio_bucket" VARCHAR(64) NOT NULL DEFAULT 'fiches',
    "minio_object_key" VARCHAR(256) NOT NULL,
    "minio_version_id" VARCHAR(64),
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "issued_by" UUID NOT NULL,
    "issued_from_ip" VARCHAR(45) NOT NULL,
    "watermark" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_revocations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "document_id" UUID NOT NULL,
    "reason" "DocumentRevocationReason" NOT NULL,
    "reason_text" TEXT,
    "revoked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_by" UUID NOT NULL,

    CONSTRAINT "document_revocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_access_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "document_id" UUID,
    "action" "DocumentAccessAction" NOT NULL,
    "jti" UUID,
    "ip_address" VARCHAR(45) NOT NULL,
    "user_agent" VARCHAR(500),
    "result" "DocumentAccessResult" NOT NULL,
    "reason_code" VARCHAR(32),
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "documents_jti_key" ON "documents"("jti");
CREATE UNIQUE INDEX "documents_serial_number_key" ON "documents"("serial_number");
CREATE INDEX "documents_nina_type_idx" ON "documents"("nina", "type");
CREATE INDEX "documents_issued_at_idx" ON "documents"("issued_at");
CREATE INDEX "documents_expires_at_idx" ON "documents"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "document_revocations_document_id_key" ON "document_revocations"("document_id");

-- CreateIndex
CREATE INDEX "document_access_logs_jti_idx" ON "document_access_logs"("jti");
CREATE INDEX "document_access_logs_occurred_at_idx" ON "document_access_logs"("occurred_at");
CREATE INDEX "document_access_logs_action_result_idx" ON "document_access_logs"("action", "result");

-- AddForeignKey
ALTER TABLE "document_revocations" ADD CONSTRAINT "document_revocations_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "document_access_logs" ADD CONSTRAINT "document_access_logs_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────
-- Triggers append-only sur document_revocations
-- Une révocation est un fait juridique : aucune mise à jour ni
-- suppression n'est tolérée. Annulation = nouvelle ligne (réémission).
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION block_document_revocation_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'document_revocations is append-only — no UPDATE/DELETE allowed (jti=%)', OLD.document_id;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_no_update_document_revocations
  BEFORE UPDATE ON "document_revocations"
  FOR EACH ROW EXECUTE FUNCTION block_document_revocation_mutation();

CREATE TRIGGER trg_no_delete_document_revocations
  BEFORE DELETE ON "document_revocations"
  FOR EACH ROW EXECUTE FUNCTION block_document_revocation_mutation();

-- ─────────────────────────────────────────────────────────────────
-- Trigger append-only sur document_access_logs (journal forensique)
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION block_document_access_log_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'document_access_logs is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_no_update_document_access_logs
  BEFORE UPDATE ON "document_access_logs"
  FOR EACH ROW EXECUTE FUNCTION block_document_access_log_mutation();

CREATE TRIGGER trg_no_delete_document_access_logs
  BEFORE DELETE ON "document_access_logs"
  FOR EACH ROW EXECUTE FUNCTION block_document_access_log_mutation();

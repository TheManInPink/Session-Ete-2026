-- Bloc F — Biométrie : protection de template ISO/IEC 24745 (cancelable).
-- Modèles ADDITIFS uniquement (n'altèrent PAS l'existant — `citizens.fingerprint_hash`
-- legacy conservé). Cf. docs/25-BLOC-F-BIOMETRIE.md §4.1, ADR-025, DPIA-NINA-AES-2026.
--
-- CANON : on ne stocke JAMAIS l'image brute ni le template en clair — uniquement un
-- template PROTÉGÉ (`protected_template` bytea), comparé par DISTANCE + seuil τ (jamais
-- par égalité). Le paramètre cancelable (« sel » de projection) reste dans Vault — seul
-- son `transform_kid` est référencé ici.

-- CreateEnum
CREATE TYPE "biometric_kind" AS ENUM ('FINGERPRINT', 'FACE');

-- CreateTable
CREATE TABLE "biometric_templates" (
    "id" BIGSERIAL NOT NULL,
    "citizen_id" UUID NOT NULL,
    "kind" "biometric_kind" NOT NULL,
    "protected_template" BYTEA NOT NULL,
    "transform_kid" VARCHAR(80) NOT NULL,
    "protection_scheme" VARCHAR(80) NOT NULL,
    "template_format" VARCHAR(60) NOT NULL,
    "match_metric" VARCHAR(30) NOT NULL,
    "match_threshold" DOUBLE PRECISION NOT NULL,
    "captured_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "captured_by" VARCHAR(100) NOT NULL,
    "consent_signer_kid" VARCHAR(160) NOT NULL,
    "consent_jti" VARCHAR(120) NOT NULL,
    "consent_doc_url" VARCHAR(500),
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_reason" VARCHAR(200),

    CONSTRAINT "biometric_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "biometric_consents" (
    "id" UUID NOT NULL,
    "citizen_id" UUID NOT NULL,
    "jti" VARCHAR(120) NOT NULL,
    "signer_kid" VARCHAR(160) NOT NULL,
    "scope" VARCHAR(60) NOT NULL,
    "channel" VARCHAR(30) NOT NULL,
    "lang" VARCHAR(10) NOT NULL,
    "consent_jws" TEXT NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "biometric_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "biometric_access_logs" (
    "id" UUID NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(80) NOT NULL,
    "entity_id" VARCHAR(120) NOT NULL,
    "actor_id" VARCHAR(100),
    "actor_type" VARCHAR(40) NOT NULL,
    "ip_address" VARCHAR(45),
    "metadata" JSONB,
    "relayed" BOOLEAN NOT NULL DEFAULT false,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "biometric_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "biometric_templates_citizen_id_kind_revoked_at_idx" ON "biometric_templates"("citizen_id", "kind", "revoked_at");

-- CreateIndex
CREATE INDEX "biometric_templates_transform_kid_idx" ON "biometric_templates"("transform_kid");

-- CreateIndex
CREATE UNIQUE INDEX "biometric_consents_jti_key" ON "biometric_consents"("jti");

-- CreateIndex
CREATE INDEX "biometric_consents_citizen_id_idx" ON "biometric_consents"("citizen_id");

-- CreateIndex
CREATE INDEX "biometric_consents_revoked_at_idx" ON "biometric_consents"("revoked_at");

-- CreateIndex
CREATE INDEX "biometric_access_logs_entity_id_idx" ON "biometric_access_logs"("entity_id");

-- CreateIndex
CREATE INDEX "biometric_access_logs_actor_id_idx" ON "biometric_access_logs"("actor_id");

-- CreateIndex
CREATE INDEX "biometric_access_logs_occurred_at_idx" ON "biometric_access_logs"("occurred_at");

-- CreateIndex
CREATE INDEX "biometric_access_logs_relayed_idx" ON "biometric_access_logs"("relayed");

-- AddForeignKey
ALTER TABLE "biometric_templates" ADD CONSTRAINT "biometric_templates_citizen_id_fkey" FOREIGN KEY ("citizen_id") REFERENCES "citizens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "biometric_consents" ADD CONSTRAINT "biometric_consents_citizen_id_fkey" FOREIGN KEY ("citizen_id") REFERENCES "citizens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════
-- Migration enrollment_centers — Doc (PROMPT 3.6 — appointment-service)
-- Adds: EnrollmentCenter (profil opérationnel 1:1 d'une Institution).
--
-- Sépare la configuration de prise de RDV (horaires, capacité, quotas,
-- fenêtre prioritaire vulnérables, géo) de l'identité institutionnelle
-- partagée (table `institutions`). 100% additif : aucune colonne existante
-- modifiée, aucune donnée touchée. Les `appointments` continuent de référencer
-- `institutions(id)` via `institution_id` (vocabulaire applicatif : centerId).
-- ═══════════════════════════════════════════════════════════════════

-- CreateTable
CREATE TABLE "enrollment_centers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "services_offered" TEXT[],
    "capacity_per_day" INTEGER NOT NULL,
    "slot_duration_min" INTEGER NOT NULL,
    "parallel_desks" INTEGER NOT NULL DEFAULT 1,
    "standard_quota_per_day" INTEGER NOT NULL,
    "priority_quota_per_day" INTEGER NOT NULL,
    "priority_window_from" VARCHAR(5) NOT NULL,
    "priority_window_to" VARCHAR(5) NOT NULL,
    "opening_hours" JSONB NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "timezone" VARCHAR(40) NOT NULL DEFAULT 'Africa/Bamako',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "enrollment_centers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "enrollment_centers_institution_id_key" ON "enrollment_centers"("institution_id");
CREATE INDEX "enrollment_centers_is_active_idx" ON "enrollment_centers"("is_active");

-- AddForeignKey
ALTER TABLE "enrollment_centers" ADD CONSTRAINT "enrollment_centers_institution_id_fkey"
  FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ════════════════════════════════════════════════════════════════════════════
--  Migration : audit_chain_immutability
--  Service   : audit-service (doc 09)
--  Objet     :
--    1. Crée la table `audit_roots` (racines scellées Ed25519).
--    2. Rend `audit_logs` ET `audit_roots` APPEND-ONLY au niveau base de
--       données via des triggers BEFORE UPDATE / BEFORE DELETE qui lèvent une
--       exception. Toute tentative d'altération rétroactive est rejetée même
--       pour un superuser (sauf à désactiver explicitement le trigger, ce qui
--       requiert d'être propriétaire de la table — opération elle-même
--       journalisée par PostgreSQL).
--    3. Défense en profondeur : retire UPDATE/DELETE au rôle applicatif.
--
--  NB : la signature par-ligne (`audit_logs.signature`) n'est JAMAIS mise à
--  jour après l'insertion (ce serait bloqué par le trigger) — le scellement
--  cryptographique se fait dans `audit_roots`.
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
--  1. Table audit_roots
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE "audit_roots" (
    "id"                 BIGSERIAL    NOT NULL,
    "chain_root_hash"    VARCHAR(64)  NOT NULL,
    "last_log_id"        BIGINT       NOT NULL,
    "log_count_covered"  INTEGER      NOT NULL,
    "signature"          VARCHAR(160) NOT NULL,
    "signing_key_id"     VARCHAR(80)  NOT NULL,
    "published_external" BOOLEAN      NOT NULL DEFAULT false,
    "signed_at"          TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_roots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_roots_signed_at_idx"   ON "audit_roots"("signed_at");
CREATE INDEX "audit_roots_last_log_id_idx" ON "audit_roots"("last_log_id");

-- ────────────────────────────────────────────────────────────────────────────
--  2. Fonction commune de rejet + triggers append-only
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION nina_reject_audit_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'append-only: opération % interdite sur la table %', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege',
          HINT    = 'Le journal d''audit est immuable (cf. doc 09). Toute correction passe par un nouvel événement, jamais par une modification.';
END;
$$ LANGUAGE plpgsql;

-- audit_logs : interdit UPDATE et DELETE
CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION nina_reject_audit_mutation();

CREATE TRIGGER audit_logs_no_delete
  BEFORE DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION nina_reject_audit_mutation();

-- audit_roots : interdit UPDATE et DELETE
CREATE TRIGGER audit_roots_no_update
  BEFORE UPDATE ON "audit_roots"
  FOR EACH ROW EXECUTE FUNCTION nina_reject_audit_mutation();

CREATE TRIGGER audit_roots_no_delete
  BEFORE DELETE ON "audit_roots"
  FOR EACH ROW EXECUTE FUNCTION nina_reject_audit_mutation();

COMMENT ON TRIGGER audit_logs_no_update ON "audit_logs" IS
  'Append-only. La suppression du trigger requiert le propriétaire de la table + un ticket de changement signé.';
COMMENT ON TRIGGER audit_logs_no_delete ON "audit_logs" IS
  'Append-only enforcement (DELETE).';

-- ────────────────────────────────────────────────────────────────────────────
--  3. Défense en profondeur : retirer UPDATE/DELETE au rôle applicatif.
--     Best-effort : ne casse pas la migration si le rôle n'existe pas dans cet
--     environnement (dev local mono-rôle vs prod avec rôle `nina_app` dédié).
-- ────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nina_app') THEN
    REVOKE UPDATE, DELETE ON "audit_logs"  FROM nina_app;
    REVOKE UPDATE, DELETE ON "audit_roots" FROM nina_app;
  END IF;
END
$$;

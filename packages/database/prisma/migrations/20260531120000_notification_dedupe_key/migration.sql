-- ═══════════════════════════════════════════════════════════════════
-- Migration notification_dedupe_key — Doc 12 (PROMPT 3.5 — notification-service)
-- Adds: notifications.dedupe_key (idempotence multicanal).
--
-- Clé d'unicité = SHA-256(recipient | channel | templateKey | payload canonique).
-- Colonne NULLABLE : PostgreSQL autorise plusieurs lignes NULL sous un index
-- UNIQUE, donc les envois en masse (broadcast) non idempotents restent permis.
-- Un doublon transactionnel (livraison RabbitMQ at-least-once, retry) viole la
-- contrainte → le service capte P2002 et renvoie la notification existante.
-- ═══════════════════════════════════════════════════════════════════

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN "dedupe_key" VARCHAR(64);

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupe_key_key" ON "notifications"("dedupe_key");

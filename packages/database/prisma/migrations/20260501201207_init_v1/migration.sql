-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CreateEnum
CREATE TYPE "sex" AS ENUM ('MALE', 'FEMALE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "marital_status" AS ENUM ('SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'SEPARATED', 'CIVIL_UNION');

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('CITIZEN', 'AGENT', 'SUPERVISOR', 'ADMIN', 'AUDITOR', 'ANTICORRUPTION_INSPECTOR');

-- CreateEnum
CREATE TYPE "correction_status" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "appointment_status" AS ENUM ('REQUESTED', 'SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "directive_status" AS ENUM ('DRAFT', 'PUBLISHED', 'IN_PROGRESS', 'ESCALATED', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "alert_severity" AS ENUM ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "vulnerability_category" AS ENUM ('ELDERLY', 'DISABLED', 'PREGNANT', 'CHRONIC_ILL', 'ILLITERATE', 'DIASPORA');

-- CreateEnum
CREATE TYPE "priority_level" AS ENUM ('P1', 'P2', 'P3');

-- CreateEnum
CREATE TYPE "language" AS ENUM ('FR', 'BM', 'SNK', 'FF', 'TMQ', 'HAU', 'MOS', 'DJE');

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "name_ascii" VARCHAR(150) NOT NULL,
    "level" SMALLINT NOT NULL,
    "parent_id" UUID,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "geom" geography(Point,4326),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "citizens" (
    "id" UUID NOT NULL,
    "nina" VARCHAR(15) NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "first_name_ascii" VARCHAR(100) NOT NULL,
    "last_name_ascii" VARCHAR(100) NOT NULL,
    "birth_date" DATE NOT NULL,
    "sex" "sex" NOT NULL,
    "marital_status" "marital_status" NOT NULL DEFAULT 'SINGLE',
    "profession" VARCHAR(100),
    "photo_url" VARCHAR(500),
    "photo_hash" VARCHAR(64),
    "fingerprint_hash" VARCHAR(64),
    "vulnerability_category" "vulnerability_category",
    "birth_place_id" UUID NOT NULL,
    "residence_id" UUID NOT NULL,
    "father_id" UUID,
    "mother_id" UUID,
    "preferred_language" "language" NOT NULL DEFAULT 'FR',
    "phone_number" VARCHAR(20),
    "email" VARCHAR(200),
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "citizens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parents" (
    "id" UUID NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "nina" VARCHAR(15),
    "sex" "sex" NOT NULL,
    "birth_date" DATE,
    "deceased" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "parents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "correction_requests" (
    "id" UUID NOT NULL,
    "citizen_id" UUID NOT NULL,
    "requested_by_user_id" UUID,
    "reviewed_by" UUID,
    "field" VARCHAR(50) NOT NULL,
    "current_value" VARCHAR(500) NOT NULL,
    "proposed_value" VARCHAR(500) NOT NULL,
    "reason" TEXT NOT NULL,
    "justification_doc_url" VARCHAR(500),
    "ai_score" DECIMAL(5,2),
    "ai_verdict" VARCHAR(30),
    "ai_explanation" JSONB,
    "status" "correction_status" NOT NULL DEFAULT 'DRAFT',
    "decided_at" TIMESTAMPTZ(6),
    "decision_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "correction_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "keycloak_id" VARCHAR(100) NOT NULL,
    "email" VARCHAR(200) NOT NULL,
    "username" VARCHAR(100) NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "role" "user_role" NOT NULL,
    "institution_id" UUID,
    "phone_number" VARCHAR(20),
    "preferred_language" "language" NOT NULL DEFAULT 'FR',
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "mfa_secret" VARCHAR(255),
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID,
    "actor_type" VARCHAR(30) NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(80) NOT NULL,
    "entity_id" VARCHAR(100),
    "old_value" JSONB,
    "new_value" JSONB,
    "ip_address" INET,
    "payload_hash" VARCHAR(64) NOT NULL,
    "previous_hash" VARCHAR(64) NOT NULL,
    "merkle_hash" VARCHAR(64) NOT NULL,
    "signature" VARCHAR(128),
    "source_event_id" VARCHAR(100) NOT NULL,
    "correlation_id" VARCHAR(100),
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL,
    "citizen_id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "location_id" UUID,
    "agent_id" UUID,
    "status" "appointment_status" NOT NULL DEFAULT 'REQUESTED',
    "queue_number" INTEGER,
    "priority" "priority_level" NOT NULL DEFAULT 'P3',
    "purpose" VARCHAR(100) NOT NULL,
    "scheduled_at" TIMESTAMPTZ(6) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aes_verification_logs" (
    "id" UUID NOT NULL,
    "requester_country" CHAR(3) NOT NULL,
    "target_nina" VARCHAR(15) NOT NULL,
    "requested_nina_hash" VARCHAR(64) NOT NULL,
    "request_type" VARCHAR(40) NOT NULL,
    "result" VARCHAR(20) NOT NULL,
    "confidence" DECIMAL(5,2),
    "latency_ms" INTEGER NOT NULL,
    "signature" VARCHAR(128) NOT NULL,
    "correlation_id" VARCHAR(100) NOT NULL,
    "client_ip" INET,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aes_verification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "corruption_alerts" (
    "id" UUID NOT NULL,
    "reporter_id" UUID,
    "agent_user_id" UUID,
    "assigned_to_user_id" UUID,
    "severity" "alert_severity" NOT NULL DEFAULT 'LOW',
    "category" VARCHAR(30) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "body" TEXT NOT NULL,
    "evidence_urls" TEXT[],
    "anonymous_reporter_token" VARCHAR(128),
    "integrity_score" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "estimated_amount" DECIMAL(18,2),
    "encrypted_payload" BYTEA,
    "encryption_key_id" VARCHAR(64),
    "status" VARCHAR(30) NOT NULL DEFAULT 'RECEIVED',
    "channel" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "corruption_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "governance_directives" (
    "id" UUID NOT NULL,
    "reference" VARCHAR(50) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "body" TEXT NOT NULL,
    "scope" VARCHAR(20) NOT NULL,
    "region_code" VARCHAR(10),
    "issued_by_user_id" UUID NOT NULL,
    "assignee_id" UUID,
    "institution_id" UUID,
    "status" "directive_status" NOT NULL DEFAULT 'DRAFT',
    "priority" "priority_level" NOT NULL DEFAULT 'P3',
    "escalation_level" INTEGER NOT NULL DEFAULT 0,
    "deadline" TIMESTAMPTZ(6),
    "signature" VARCHAR(128),
    "signed_at" TIMESTAMPTZ(6),
    "published_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "governance_directives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "directive_recipients" (
    "directive_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "acknowledged_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "directive_recipients_pkey" PRIMARY KEY ("directive_id","user_id")
);

-- CreateTable
CREATE TABLE "governance_messages" (
    "id" UUID NOT NULL,
    "directive_id" UUID,
    "sender_id" UUID NOT NULL,
    "recipient_id" UUID,
    "recipient_group" VARCHAR(100),
    "subject" VARCHAR(300) NOT NULL,
    "body" TEXT NOT NULL,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "signature" VARCHAR(128),
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "governance_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vulnerability_records" (
    "id" UUID NOT NULL,
    "citizen_id" UUID NOT NULL,
    "category" "vulnerability_category" NOT NULL,
    "description" TEXT,
    "priority" VARCHAR(2) NOT NULL DEFAULT 'P3',
    "verified_by_user_id" UUID,
    "verified_at" TIMESTAMPTZ(6),
    "evidence_url" VARCHAR(500),
    "delivery_preference" VARCHAR(20) NOT NULL DEFAULT 'SMS',
    "ussd_phone" VARCHAR(20),
    "active_from" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active_until" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "vulnerability_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institutions" (
    "id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "type" VARCHAR(30) NOT NULL,
    "parent_id" UUID,
    "location_id" UUID,
    "address" VARCHAR(300),
    "phone_number" VARCHAR(20),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "institutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "electoral_records" (
    "id" UUID NOT NULL,
    "citizen_id" UUID NOT NULL,
    "registration_number" VARCHAR(30) NOT NULL,
    "polling_station_id" UUID,
    "eligible_at" DATE NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "auto_registered_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "electoral_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kiosk_sessions" (
    "id" UUID NOT NULL,
    "kiosk_id" VARCHAR(50) NOT NULL,
    "citizen_nina" VARCHAR(15),
    "language" "language" NOT NULL DEFAULT 'FR',
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "ended_at" TIMESTAMPTZ(6),
    "actions_count" INTEGER NOT NULL DEFAULT 0,
    "printed_receipts" INTEGER NOT NULL DEFAULT 0,
    "ip_address" INET,
    "outcome" VARCHAR(30),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kiosk_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "recipient_user_id" UUID,
    "recipient_citizen_id" UUID,
    "channel" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "template_key" VARCHAR(100) NOT NULL,
    "language" "language" NOT NULL DEFAULT 'FR',
    "payload" JSONB NOT NULL,
    "provider_id" VARCHAR(100),
    "sent_at" TIMESTAMPTZ(6),
    "delivered_at" TIMESTAMPTZ(6),
    "failure_reason" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "locations_code_key" ON "locations"("code");

-- CreateIndex
CREATE INDEX "locations_parent_id_idx" ON "locations"("parent_id");

-- CreateIndex
CREATE INDEX "locations_level_idx" ON "locations"("level");

-- CreateIndex
CREATE INDEX "idx_locations_name_ascii_trgm" ON "locations" USING GIN ("name_ascii" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "citizens_nina_key" ON "citizens"("nina");

-- CreateIndex
CREATE INDEX "citizens_last_name_idx" ON "citizens"("last_name");

-- CreateIndex
CREATE INDEX "citizens_birth_date_idx" ON "citizens"("birth_date");

-- CreateIndex
CREATE INDEX "citizens_sex_idx" ON "citizens"("sex");

-- CreateIndex
CREATE INDEX "citizens_deleted_at_idx" ON "citizens"("deleted_at");

-- CreateIndex
CREATE INDEX "citizens_vulnerability_category_idx" ON "citizens"("vulnerability_category");

-- CreateIndex
CREATE INDEX "idx_citizens_lastname_trgm" ON "citizens" USING GIN ("last_name_ascii" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "idx_citizens_firstname_trgm" ON "citizens" USING GIN ("first_name_ascii" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "parents_nina_key" ON "parents"("nina");

-- CreateIndex
CREATE INDEX "parents_last_name_idx" ON "parents"("last_name");

-- CreateIndex
CREATE INDEX "correction_requests_citizen_id_idx" ON "correction_requests"("citizen_id");

-- CreateIndex
CREATE INDEX "correction_requests_status_idx" ON "correction_requests"("status");

-- CreateIndex
CREATE INDEX "correction_requests_reviewed_by_idx" ON "correction_requests"("reviewed_by");

-- CreateIndex
CREATE INDEX "correction_requests_created_at_idx" ON "correction_requests"("created_at");

-- CreateIndex
CREATE INDEX "correction_requests_deleted_at_idx" ON "correction_requests"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_keycloak_id_key" ON "users"("keycloak_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_institution_id_idx" ON "users"("institution_id");

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "audit_logs_merkle_hash_key" ON "audit_logs"("merkle_hash");

-- CreateIndex
CREATE UNIQUE INDEX "audit_logs_source_event_id_key" ON "audit_logs"("source_event_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_occurred_at_idx" ON "audit_logs"("occurred_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "appointments_citizen_id_idx" ON "appointments"("citizen_id");

-- CreateIndex
CREATE INDEX "appointments_status_idx" ON "appointments"("status");

-- CreateIndex
CREATE INDEX "appointments_scheduled_at_idx" ON "appointments"("scheduled_at");

-- CreateIndex
CREATE INDEX "appointments_institution_id_idx" ON "appointments"("institution_id");

-- CreateIndex
CREATE INDEX "aes_verification_logs_requester_country_idx" ON "aes_verification_logs"("requester_country");

-- CreateIndex
CREATE INDEX "aes_verification_logs_created_at_idx" ON "aes_verification_logs"("created_at");

-- CreateIndex
CREATE INDEX "aes_verification_logs_result_idx" ON "aes_verification_logs"("result");

-- CreateIndex
CREATE UNIQUE INDEX "corruption_alerts_anonymous_reporter_token_key" ON "corruption_alerts"("anonymous_reporter_token");

-- CreateIndex
CREATE INDEX "corruption_alerts_severity_idx" ON "corruption_alerts"("severity");

-- CreateIndex
CREATE INDEX "corruption_alerts_status_idx" ON "corruption_alerts"("status");

-- CreateIndex
CREATE INDEX "corruption_alerts_category_idx" ON "corruption_alerts"("category");

-- CreateIndex
CREATE INDEX "corruption_alerts_created_at_idx" ON "corruption_alerts"("created_at");

-- CreateIndex
CREATE INDEX "corruption_alerts_agent_user_id_idx" ON "corruption_alerts"("agent_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "governance_directives_reference_key" ON "governance_directives"("reference");

-- CreateIndex
CREATE INDEX "governance_directives_status_idx" ON "governance_directives"("status");

-- CreateIndex
CREATE INDEX "governance_directives_scope_idx" ON "governance_directives"("scope");

-- CreateIndex
CREATE INDEX "governance_directives_issued_by_user_id_idx" ON "governance_directives"("issued_by_user_id");

-- CreateIndex
CREATE INDEX "governance_directives_assignee_id_idx" ON "governance_directives"("assignee_id");

-- CreateIndex
CREATE INDEX "governance_directives_institution_id_idx" ON "governance_directives"("institution_id");

-- CreateIndex
CREATE INDEX "governance_directives_escalation_level_idx" ON "governance_directives"("escalation_level");

-- CreateIndex
CREATE INDEX "governance_directives_published_at_idx" ON "governance_directives"("published_at");

-- CreateIndex
CREATE INDEX "directive_recipients_user_id_idx" ON "directive_recipients"("user_id");

-- CreateIndex
CREATE INDEX "governance_messages_directive_id_idx" ON "governance_messages"("directive_id");

-- CreateIndex
CREATE INDEX "governance_messages_sender_id_idx" ON "governance_messages"("sender_id");

-- CreateIndex
CREATE INDEX "governance_messages_recipient_id_idx" ON "governance_messages"("recipient_id");

-- CreateIndex
CREATE INDEX "governance_messages_created_at_idx" ON "governance_messages"("created_at");

-- CreateIndex
CREATE INDEX "vulnerability_records_citizen_id_idx" ON "vulnerability_records"("citizen_id");

-- CreateIndex
CREATE INDEX "vulnerability_records_category_idx" ON "vulnerability_records"("category");

-- CreateIndex
CREATE INDEX "vulnerability_records_priority_idx" ON "vulnerability_records"("priority");

-- CreateIndex
CREATE INDEX "vulnerability_records_delivery_preference_idx" ON "vulnerability_records"("delivery_preference");

-- CreateIndex
CREATE UNIQUE INDEX "institutions_code_key" ON "institutions"("code");

-- CreateIndex
CREATE INDEX "institutions_type_idx" ON "institutions"("type");

-- CreateIndex
CREATE INDEX "institutions_parent_id_idx" ON "institutions"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "electoral_records_citizen_id_key" ON "electoral_records"("citizen_id");

-- CreateIndex
CREATE UNIQUE INDEX "electoral_records_registration_number_key" ON "electoral_records"("registration_number");

-- CreateIndex
CREATE INDEX "electoral_records_active_idx" ON "electoral_records"("active");

-- CreateIndex
CREATE INDEX "electoral_records_polling_station_id_idx" ON "electoral_records"("polling_station_id");

-- CreateIndex
CREATE INDEX "kiosk_sessions_kiosk_id_idx" ON "kiosk_sessions"("kiosk_id");

-- CreateIndex
CREATE INDEX "kiosk_sessions_started_at_idx" ON "kiosk_sessions"("started_at");

-- CreateIndex
CREATE INDEX "notifications_recipient_user_id_idx" ON "notifications"("recipient_user_id");

-- CreateIndex
CREATE INDEX "notifications_recipient_citizen_id_idx" ON "notifications"("recipient_citizen_id");

-- CreateIndex
CREATE INDEX "notifications_status_idx" ON "notifications"("status");

-- CreateIndex
CREATE INDEX "notifications_channel_idx" ON "notifications"("channel");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citizens" ADD CONSTRAINT "citizens_birth_place_id_fkey" FOREIGN KEY ("birth_place_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citizens" ADD CONSTRAINT "citizens_residence_id_fkey" FOREIGN KEY ("residence_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citizens" ADD CONSTRAINT "citizens_father_id_fkey" FOREIGN KEY ("father_id") REFERENCES "parents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citizens" ADD CONSTRAINT "citizens_mother_id_fkey" FOREIGN KEY ("mother_id") REFERENCES "parents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_requests" ADD CONSTRAINT "correction_requests_citizen_id_fkey" FOREIGN KEY ("citizen_id") REFERENCES "citizens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_requests" ADD CONSTRAINT "correction_requests_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_requests" ADD CONSTRAINT "correction_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_citizen_id_fkey" FOREIGN KEY ("citizen_id") REFERENCES "citizens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corruption_alerts" ADD CONSTRAINT "corruption_alerts_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corruption_alerts" ADD CONSTRAINT "corruption_alerts_agent_user_id_fkey" FOREIGN KEY ("agent_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corruption_alerts" ADD CONSTRAINT "corruption_alerts_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_directives" ADD CONSTRAINT "governance_directives_issued_by_user_id_fkey" FOREIGN KEY ("issued_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_directives" ADD CONSTRAINT "governance_directives_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_directives" ADD CONSTRAINT "governance_directives_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "directive_recipients" ADD CONSTRAINT "directive_recipients_directive_id_fkey" FOREIGN KEY ("directive_id") REFERENCES "governance_directives"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "directive_recipients" ADD CONSTRAINT "directive_recipients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_messages" ADD CONSTRAINT "governance_messages_directive_id_fkey" FOREIGN KEY ("directive_id") REFERENCES "governance_directives"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_messages" ADD CONSTRAINT "governance_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_messages" ADD CONSTRAINT "governance_messages_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vulnerability_records" ADD CONSTRAINT "vulnerability_records_citizen_id_fkey" FOREIGN KEY ("citizen_id") REFERENCES "citizens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vulnerability_records" ADD CONSTRAINT "vulnerability_records_verified_by_user_id_fkey" FOREIGN KEY ("verified_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "electoral_records" ADD CONSTRAINT "electoral_records_citizen_id_fkey" FOREIGN KEY ("citizen_id") REFERENCES "citizens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "electoral_records" ADD CONSTRAINT "electoral_records_polling_station_id_fkey" FOREIGN KEY ("polling_station_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_citizen_id_fkey" FOREIGN KEY ("recipient_citizen_id") REFERENCES "citizens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

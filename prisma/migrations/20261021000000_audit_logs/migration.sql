CREATE TABLE "audit_logs" (
    "id" BIGSERIAL PRIMARY KEY,
    "actor_id" BIGINT,
    "actor_name" VARCHAR(100) NOT NULL,
    "actor_role" VARCHAR(30),
    "action" VARCHAR(60) NOT NULL,
    "entity_type" VARCHAR(30) NOT NULL,
    "entity_id" BIGINT,
    "outcome" VARCHAR(20) NOT NULL CHECK ("outcome" IN ('SUCCESS', 'FAILURE', 'DENIED')),
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Identity snapshots survive later account changes; references are historical, not foreign keys.
CREATE INDEX "audit_logs_created_at_id_idx" ON "audit_logs" ("created_at", "id");
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs" ("actor_id", "created_at");
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs" ("entity_type", "entity_id");
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs" ("action", "created_at");

CREATE FUNCTION prevent_audit_log_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Audit logs are append-only';
END;
$$;

CREATE TRIGGER audit_logs_append_only
BEFORE UPDATE OR DELETE OR TRUNCATE ON "audit_logs"
FOR EACH STATEMENT EXECUTE FUNCTION prevent_audit_log_changes();

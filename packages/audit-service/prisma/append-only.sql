-- Append-only enforcement for the audit schema (CLAUDE.md rule #4).
-- Run once, as the Postgres superuser/owner (the same credentials used for
-- AUDIT_DATABASE_URL), against the target database. Idempotent — safe to
-- re-run (CREATE ROLE is guarded, GRANT/REVOKE are naturally idempotent).
--
-- audit_writer is the runtime role audit-service connects as
-- (AUDIT_RUNTIME_DATABASE_URL). It gets INSERT+SELECT only on AuditLog —
-- no UPDATE, no DELETE, ever, not even for "fixing a typo" — that's the
-- literal DB-level enforcement of "the audit log is append-only" rather
-- than just an application-code convention. Notification is a different
-- table with real update behavior (PATCH /notifications/:id/read), so it
-- gets a normal SELECT/INSERT/UPDATE grant — the append-only restriction is
-- specific to AuditLog, not a blanket "this role can never UPDATE anything."

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'audit_writer') THEN
    CREATE ROLE audit_writer LOGIN PASSWORD 'change-me-in-production';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA audit TO audit_writer;

GRANT SELECT, INSERT ON audit."AuditLog" TO audit_writer;
REVOKE UPDATE, DELETE ON audit."AuditLog" FROM audit_writer;
REVOKE UPDATE, DELETE ON audit."AuditLog" FROM PUBLIC;

GRANT SELECT, INSERT, UPDATE ON audit."Notification" TO audit_writer;

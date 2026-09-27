-- V001__schema_migrations_meta.sql
-- Managed by migration-center (idempotent meta table created in code; this file documents baseline)
CREATE TABLE IF NOT EXISTS schema_migrations (
  script TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

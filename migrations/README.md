# SQLite migrations

Files named `NNN-description.sql` here ship inside each release and are applied by
the backend at startup (`runMigrations` in `electron/services/database.ts`), in
filename order, each once, inside a transaction. Applied names are recorded in the
`schema_migrations` table.

Rules: never edit a shipped migration; keep them idempotent-safe (`IF NOT EXISTS`,
guarded `ALTER`) because a rolled-back-then-retried update restores the pre-update
DB snapshot and re-runs them. A migration that throws makes the backend fail its
health check, which triggers an automatic rollback of both code and DB.

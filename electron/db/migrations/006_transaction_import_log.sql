-- Links each imported transaction back to its ImportLog, so an import can be
-- deleted cleanly (removing exactly the rows it created). Null for transactions
-- created outside the import pipeline (manual entry) and for rows imported
-- before this migration (those fall back to source_file matching on delete).
ALTER TABLE transactions ADD COLUMN import_log_id INTEGER REFERENCES import_log(id);
CREATE INDEX idx_transactions_import_log ON transactions(import_log_id);

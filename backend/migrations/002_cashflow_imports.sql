CREATE TABLE IF NOT EXISTS cashflow_imports(
 id uuid PRIMARY KEY,
 company_id uuid NOT NULL REFERENCES companies(id),
 actor_id uuid NOT NULL REFERENCES users(id),
 imported_count integer NOT NULL,
 source_sha256 text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO schema_migrations(version) VALUES(2) ON CONFLICT DO NOTHING;

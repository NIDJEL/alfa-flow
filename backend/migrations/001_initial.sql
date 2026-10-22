CREATE TABLE IF NOT EXISTS schema_migrations(version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS companies(id uuid PRIMARY KEY, data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS users(id uuid PRIMARY KEY, name text NOT NULL, role text NOT NULL, persona text UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS memberships(user_id uuid REFERENCES users(id), company_id uuid REFERENCES companies(id), PRIMARY KEY(user_id,company_id));
CREATE TABLE IF NOT EXISTS sessions(token_hash text PRIMARY KEY, actor jsonb NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS loan_products(id text PRIMARY KEY, data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS rule_sets(id text NOT NULL, version text NOT NULL, data jsonb NOT NULL, PRIMARY KEY(id,version));
CREATE TABLE IF NOT EXISTS credit_applications(
 id uuid PRIMARY KEY, company_id uuid NOT NULL REFERENCES companies(id), status text NOT NULL,
 version integer NOT NULL CHECK(version>0), data jsonb NOT NULL,
 created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS applications_company_created ON credit_applications(company_id,created_at DESC);
CREATE INDEX IF NOT EXISTS applications_status_created ON credit_applications(status,created_at DESC);
CREATE TABLE IF NOT EXISTS financial_transactions(id uuid PRIMARY KEY, company_id uuid NOT NULL REFERENCES companies(id), data jsonb NOT NULL);
CREATE INDEX IF NOT EXISTS transactions_company ON financial_transactions(company_id);
CREATE TABLE IF NOT EXISTS application_revisions(application_id uuid NOT NULL REFERENCES credit_applications(id), version integer NOT NULL, data jsonb NOT NULL, PRIMARY KEY(application_id,version));
CREATE TABLE IF NOT EXISTS documents(id uuid PRIMARY KEY, application_id uuid NOT NULL REFERENCES credit_applications(id), data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS financial_snapshots(id text PRIMARY KEY, application_id uuid NOT NULL REFERENCES credit_applications(id), data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS external_check_runs(id uuid PRIMARY KEY, application_id uuid NOT NULL REFERENCES credit_applications(id), data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS score_runs(id uuid PRIMARY KEY, application_id uuid NOT NULL REFERENCES credit_applications(id), data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS decision_runs(id uuid PRIMARY KEY, application_id uuid NOT NULL REFERENCES credit_applications(id), data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS loan_offers(id uuid PRIMARY KEY, application_id uuid NOT NULL REFERENCES credit_applications(id), revision integer NOT NULL, data jsonb NOT NULL, UNIQUE(application_id,revision));
CREATE TABLE IF NOT EXISTS application_events(id uuid PRIMARY KEY, application_id uuid NOT NULL REFERENCES credit_applications(id), data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS notifications(id uuid PRIMARY KEY, application_id uuid NOT NULL REFERENCES credit_applications(id), data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS audit_logs(id uuid PRIMARY KEY, application_id uuid NOT NULL REFERENCES credit_applications(id), data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS simulated_disbursements(id uuid PRIMARY KEY, application_id uuid UNIQUE NOT NULL REFERENCES credit_applications(id), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS idempotency_keys(actor_id uuid NOT NULL, action text NOT NULL, key text NOT NULL, request_hash text NOT NULL, response jsonb NOT NULL, PRIMARY KEY(actor_id,action,key));
CREATE OR REPLACE FUNCTION reject_append_only_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'append-only table'; END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['application_revisions','financial_snapshots','external_check_runs','score_runs','decision_runs','loan_offers','application_events','audit_logs'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname=t||'_immutable' AND tgrelid=to_regclass(t)) THEN
   EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_append_only_change()',t||'_immutable',t);
  END IF;
 END LOOP;
END $$;
INSERT INTO schema_migrations(version) VALUES(1) ON CONFLICT DO NOTHING;

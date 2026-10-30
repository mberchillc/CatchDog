CREATE TABLE work_emission_cases (
 id text PRIMARY KEY NOT NULL, tenant_id text NOT NULL, owner_id text NOT NULL REFERENCES pilot_users(id),
 client_id text REFERENCES work_clients(id), company_id text, branch text NOT NULL,
 payload text NOT NULL, claim_token text, response_payload text, response_id text, response_hash text,
 token_hash text, token_expires_at integer, token_used_at integer, token_revoked_at integer,
 status text NOT NULL DEFAULT 'draft', version integer NOT NULL DEFAULT 1, created_at integer NOT NULL, updated_at integer NOT NULL
);
CREATE INDEX emission_cases_owner ON work_emission_cases(tenant_id,owner_id,updated_at);
CREATE UNIQUE INDEX emission_case_response ON work_emission_cases(response_id);
CREATE TABLE work_emission_files (
 id text PRIMARY KEY NOT NULL, case_id text NOT NULL REFERENCES work_emission_cases(id), tenant_id text NOT NULL, owner_id text NOT NULL REFERENCES pilot_users(id),
 upload_id text NOT NULL, object_key text NOT NULL, payload text NOT NULL, mime text NOT NULL, bytes integer NOT NULL, fingerprint text NOT NULL,
 state text NOT NULL, lease_token text NOT NULL, lease_expires_at integer NOT NULL, imported integer NOT NULL DEFAULT 0, created_at integer NOT NULL
);
CREATE UNIQUE INDEX emission_file_upload ON work_emission_files(case_id,upload_id);
CREATE INDEX emission_files_owner ON work_emission_files(tenant_id,owner_id,state);
CREATE TABLE work_collection_entries (
 id text PRIMARY KEY NOT NULL, case_id text NOT NULL REFERENCES work_emission_cases(id), tenant_id text NOT NULL, owner_id text NOT NULL REFERENCES pilot_users(id),
 payload text NOT NULL, status text NOT NULL, version integer NOT NULL DEFAULT 1, created_at integer NOT NULL, updated_at integer NOT NULL
);
CREATE INDEX collection_case ON work_collection_entries(tenant_id,owner_id,case_id);

CREATE TABLE work_emission_history(case_id text NOT NULL REFERENCES work_emission_cases(id),version integer NOT NULL,payload text NOT NULL,created_at integer NOT NULL,PRIMARY KEY(case_id,version));

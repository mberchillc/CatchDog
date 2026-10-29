CREATE TABLE work_quote_intakes (
 id text PRIMARY KEY NOT NULL,
 tenant_id text NOT NULL,
 owner_id text NOT NULL REFERENCES pilot_users(id),
 request_key text NOT NULL,
 request_hash text NOT NULL,
 payload text NOT NULL,
 status text NOT NULL,
 version integer NOT NULL DEFAULT 1,
 created_at integer NOT NULL,
 updated_at integer NOT NULL
);
CREATE UNIQUE INDEX work_quote_intakes_request_key ON work_quote_intakes(tenant_id,owner_id,request_key);
CREATE INDEX work_quote_intakes_owner ON work_quote_intakes(tenant_id,owner_id,updated_at);

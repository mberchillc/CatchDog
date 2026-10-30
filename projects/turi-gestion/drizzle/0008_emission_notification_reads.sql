CREATE TABLE work_emission_reads (
 case_id text NOT NULL REFERENCES work_emission_cases(id),
 response_id text NOT NULL,
 viewer_id text NOT NULL REFERENCES pilot_users(id),
 tenant_id text NOT NULL,
 read_at integer NOT NULL,
 PRIMARY KEY(case_id,response_id,viewer_id)
);
CREATE INDEX emission_reads_viewer ON work_emission_reads(tenant_id,viewer_id,response_id);

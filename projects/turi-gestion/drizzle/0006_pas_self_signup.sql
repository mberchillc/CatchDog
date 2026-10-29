CREATE TABLE pilot_pas_invitations (
 id text PRIMARY KEY NOT NULL,
 tenant_id text NOT NULL,
 name text NOT NULL,
 token_hash text NOT NULL,
 created_by text NOT NULL REFERENCES pilot_users(id),
 expires_at integer NOT NULL,
 used_at integer,
 revoked_at integer,
 claim_token text,
 claimed_user_id text,
 created_at integer NOT NULL
);
CREATE UNIQUE INDEX pilot_pas_invitation_token ON pilot_pas_invitations(token_hash);
CREATE INDEX pilot_pas_invitation_tenant ON pilot_pas_invitations(tenant_id,expires_at);

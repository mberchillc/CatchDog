CREATE TABLE `work_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`payload` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`client_id` text NOT NULL,
	`policy_id` text,
	`claim_id` text,
	`upload_id` text NOT NULL,
	`object_key` text NOT NULL,
	`mime` text NOT NULL,
	`bytes` integer NOT NULL,
	`state` text NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`lease_token` text NOT NULL,
	`lease_expires_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `pilot_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`) REFERENCES `work_clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`policy_id`) REFERENCES `work_policies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`claim_id`) REFERENCES `work_claims`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_document_upload` ON `work_documents` (`tenant_id`,`owner_id`,`upload_id`);--> statement-breakpoint
CREATE INDEX `work_documents_client` ON `work_documents` (`tenant_id`,`owner_id`,`client_id`);
CREATE TABLE `work_record_archive_events` (
	`tenant_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`record_type` text NOT NULL,
	`record_id` text NOT NULL,
	`version` integer NOT NULL,
	`action` text NOT NULL,
	`payload` text NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`tenant_id`, `record_type`, `record_id`, `version`),
	FOREIGN KEY (`owner_id`) REFERENCES `pilot_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `pilot_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `work_record_archives` (
	`tenant_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`record_type` text NOT NULL,
	`record_id` text NOT NULL,
	`state` text NOT NULL,
	`payload` text NOT NULL,
	`actor_id` text NOT NULL,
	`archived_at` integer NOT NULL,
	`restored_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`tenant_id`, `record_type`, `record_id`),
	FOREIGN KEY (`owner_id`) REFERENCES `pilot_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `pilot_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `record_archives_owner` ON `work_record_archives` (`tenant_id`,`owner_id`,`state`,`archived_at`);
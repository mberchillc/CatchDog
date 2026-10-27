CREATE TABLE `pilot_auth_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`value_hash` text NOT NULL,
	`payload` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`claim_token` text,
	`sent_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `pilot_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `pilot_users` ADD `access_code_hash` text;--> statement-breakpoint
ALTER TABLE `pilot_users` ADD `pending_code_hash` text;--> statement-breakpoint
ALTER TABLE `pilot_users` ADD `pending_code_expires_at` integer;--> statement-breakpoint
ALTER TABLE `pilot_users` ADD `email` text;--> statement-breakpoint
ALTER TABLE `pilot_users` ADD `email_verified` integer DEFAULT 0;
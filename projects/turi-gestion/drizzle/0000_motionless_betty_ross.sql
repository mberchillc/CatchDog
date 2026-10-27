CREATE TABLE `pilot_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`record_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_tenant_time` ON `pilot_audit` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `pilot_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`producer_id` text NOT NULL,
	`company_id` text NOT NULL,
	`method` text NOT NULL,
	`encrypted_payload` text NOT NULL,
	`status` text DEFAULT 'registered' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`authorized` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`producer_id`) REFERENCES `pilot_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `connection_producer_company` ON `pilot_connections` (`producer_id`,`company_id`);--> statement-breakpoint
CREATE TABLE `pilot_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pilot_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`csrf` text NOT NULL,
	`mfa` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL,
	`last_seen` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `pilot_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `pilot_users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`tenant_id` text NOT NULL,
	`password_hash` text NOT NULL,
	`mfa_secret` text NOT NULL,
	`mfa_enabled` integer DEFAULT 0 NOT NULL,
	`recovery_hashes` text DEFAULT '[]' NOT NULL,
	`last_totp_step` integer DEFAULT -1 NOT NULL,
	`disabled` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pilot_users_username_unique` ON `pilot_users` (`username`);
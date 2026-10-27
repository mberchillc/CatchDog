CREATE TABLE `work_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`payload` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`policy_id` text NOT NULL,
	`status` text NOT NULL,
	`occurred_on` text NOT NULL,
	`next_due` text,
	FOREIGN KEY (`owner_id`) REFERENCES `pilot_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`policy_id`) REFERENCES `work_policies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `work_claims_owner` ON `work_claims` (`tenant_id`,`owner_id`);--> statement-breakpoint
CREATE TABLE `work_clients` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`payload` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `pilot_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `work_clients_owner` ON `work_clients` (`tenant_id`,`owner_id`);--> statement-breakpoint
CREATE TABLE `work_integration_reviews` (
	`connection_id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`producer_id` text NOT NULL,
	`connection_version` integer NOT NULL,
	`permission` text NOT NULL,
	`channel` text NOT NULL,
	`technical` text NOT NULL,
	`payload` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `pilot_connections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`producer_id`) REFERENCES `pilot_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `work_offers` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`payload` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`quote_id` text NOT NULL,
	`company_id` text NOT NULL,
	`valid_until` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `pilot_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`quote_id`) REFERENCES `work_quotes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `work_offers_quote` ON `work_offers` (`quote_id`);--> statement-breakpoint
CREATE TABLE `work_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`payload` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`client_id` text NOT NULL,
	`company_id` text NOT NULL,
	`branch` text NOT NULL,
	`status` text NOT NULL,
	`starts_on` text NOT NULL,
	`expires_on` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `pilot_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`) REFERENCES `work_clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `work_policies_owner` ON `work_policies` (`tenant_id`,`owner_id`);--> statement-breakpoint
CREATE TABLE `work_quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`payload` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`client_id` text NOT NULL,
	`branch` text NOT NULL,
	`status` text NOT NULL,
	`selected_offer_id` text,
	`approved_by` text,
	`approved_at` integer,
	FOREIGN KEY (`owner_id`) REFERENCES `pilot_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`) REFERENCES `work_clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by`) REFERENCES `pilot_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `work_quotes_owner` ON `work_quotes` (`tenant_id`,`owner_id`);--> statement-breakpoint
CREATE TABLE `work_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`payload` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`client_id` text,
	`category` text NOT NULL,
	`priority` text NOT NULL,
	`status` text NOT NULL,
	`due_on` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `pilot_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`) REFERENCES `work_clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `work_tasks_owner` ON `work_tasks` (`tenant_id`,`owner_id`);
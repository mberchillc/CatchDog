CREATE TABLE `pilot_ai_connections` (
  `id` text PRIMARY KEY NOT NULL,
  `tenant_id` text NOT NULL,
  `owner_id` text NOT NULL,
  `provider` text NOT NULL CHECK (`provider` IN ('openai','gemini','claude','copilot','meta')),
  `encrypted_payload` text NOT NULL,
  `status` text NOT NULL DEFAULT 'configured' CHECK (`status` IN ('configured','verified','failed')),
  `version` integer NOT NULL DEFAULT 1,
  `verified_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`owner_id`) REFERENCES `pilot_users`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE UNIQUE INDEX `ai_connection_owner_provider` ON `pilot_ai_connections` (`tenant_id`,`owner_id`,`provider`);

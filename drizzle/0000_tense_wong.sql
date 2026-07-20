CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `apikey` (
	`id` text PRIMARY KEY NOT NULL,
	`config_id` text DEFAULT 'default' NOT NULL,
	`name` text,
	`start` text,
	`reference_id` text NOT NULL,
	`prefix` text,
	`key` text NOT NULL,
	`refill_interval` integer,
	`refill_amount` integer,
	`last_refill_at` integer,
	`enabled` integer DEFAULT true,
	`rate_limit_enabled` integer DEFAULT true,
	`rate_limit_time_window` integer,
	`rate_limit_max` integer,
	`request_count` integer DEFAULT 0,
	`remaining` integer,
	`last_request` integer,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`permissions` text,
	`metadata` text,
	FOREIGN KEY (`reference_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `apikey_key_unique` ON `apikey` (`key`);--> statement-breakpoint
CREATE INDEX `apikey_config_id_idx` ON `apikey` (`config_id`);--> statement-breakpoint
CREATE INDEX `apikey_reference_id_idx` ON `apikey` (`reference_id`);--> statement-breakpoint
CREATE TABLE `device_code` (
	`id` text PRIMARY KEY NOT NULL,
	`device_code` text NOT NULL,
	`user_code` text NOT NULL,
	`user_id` text,
	`client_id` text,
	`scope` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer NOT NULL,
	`last_polled_at` integer,
	`polling_interval` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `device_code_device_code_unique` ON `device_code` (`device_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `device_code_user_code_unique` ON `device_code` (`user_code`);--> statement-breakpoint
CREATE INDEX `device_code_user_code_idx` ON `device_code` (`user_code`);--> statement-breakpoint
CREATE TABLE `document_job` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`operation` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`file_name` text NOT NULL,
	`source_url` text,
	`source_key` text,
	`idempotency_key_hash` text NOT NULL,
	`request_hash` text NOT NULL,
	`providers` text NOT NULL,
	`outputs` text NOT NULL,
	`result_key` text,
	`result_expires_at` integer,
	`error` text,
	`page_count` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `document_job_user_id_idx` ON `document_job` (`user_id`);--> statement-breakpoint
CREATE INDEX `document_job_result_expires_at_idx` ON `document_job` (`result_expires_at`);--> statement-breakpoint
CREATE INDEX `document_job_created_at_idx` ON `document_job` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `document_job_user_id_idempotency_key_idx` ON `document_job` (`user_id`,`idempotency_key_hash`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`is_anonymous` integer DEFAULT false,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);

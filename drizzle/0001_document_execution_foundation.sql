DROP TABLE `document_job`;--> statement-breakpoint
CREATE TABLE `document` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'ready' NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`etag` text NOT NULL,
	`object_key` text,
	`idempotency_key_hash` text NOT NULL,
	`request_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `document_expires_at_idx` ON `document` (`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `document_user_id_idempotency_key_idx` ON `document` (`user_id`,`idempotency_key_hash`);--> statement-breakpoint
CREATE TABLE `document_job` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`document_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`idempotency_key_hash` text NOT NULL,
	`request_hash` text NOT NULL,
	`metadata` text,
	`metering_status` text DEFAULT 'pending' NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_id`) REFERENCES `document`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `document_job_document_id_idx` ON `document_job` (`document_id`);--> statement-breakpoint
CREATE INDEX `document_job_created_at_idx` ON `document_job` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `document_job_user_id_idempotency_key_idx` ON `document_job` (`user_id`,`idempotency_key_hash`);--> statement-breakpoint
CREATE TABLE `document_execution` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`provider` text NOT NULL,
	`position` integer NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`outputs` text NOT NULL,
	`options` text,
	`include_raw` integer DEFAULT false NOT NULL,
	`pages` text,
	`result_key` text,
	`result_expires_at` integer,
	`page_count` integer,
	`duration_ms` integer,
	`usage` text,
	`error_code` text,
	`error_message` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`job_id`) REFERENCES `document_job`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `document_execution_job_id_idx` ON `document_execution` (`job_id`);--> statement-breakpoint
CREATE INDEX `document_execution_result_expires_at_idx` ON `document_execution` (`result_expires_at`);

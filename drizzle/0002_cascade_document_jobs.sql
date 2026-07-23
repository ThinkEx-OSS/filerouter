PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_document_job` (
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
	FOREIGN KEY (`document_id`) REFERENCES `document`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_document_job`("id", "user_id", "document_id", "status", "idempotency_key_hash", "request_hash", "metadata", "metering_status", "error", "created_at", "updated_at") SELECT "id", "user_id", "document_id", "status", "idempotency_key_hash", "request_hash", "metadata", "metering_status", "error", "created_at", "updated_at" FROM `document_job`;--> statement-breakpoint
DROP TABLE `document_job`;--> statement-breakpoint
ALTER TABLE `__new_document_job` RENAME TO `document_job`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `document_job_document_id_idx` ON `document_job` (`document_id`);--> statement-breakpoint
CREATE INDEX `document_job_created_at_idx` ON `document_job` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `document_job_user_id_idempotency_key_idx` ON `document_job` (`user_id`,`idempotency_key_hash`);

ALTER TABLE `document_execution` ADD `key` text NOT NULL DEFAULT '';--> statement-breakpoint
UPDATE `document_execution` SET `key` = `provider`;--> statement-breakpoint
CREATE UNIQUE INDEX `document_execution_job_id_key_idx` ON `document_execution` (`job_id`,`key`);

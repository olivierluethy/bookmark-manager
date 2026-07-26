CREATE TABLE `bookmarks` (
	`id` text PRIMARY KEY NOT NULL,
	`folder_id` text,
	`url` text NOT NULL,
	`normalized_url` text NOT NULL,
	`url_hash` text NOT NULL,
	`site` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`favicon_url` text,
	`preview_image` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`notes` text,
	`is_pinned` integer DEFAULT false NOT NULL,
	`added_at` integer NOT NULL,
	`last_opened_at` integer,
	`open_count` integer DEFAULT 0 NOT NULL,
	`deleted_at` integer,
	`source_browser` text,
	`import_batch_id` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`import_batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `bookmarks_url_hash_idx` ON `bookmarks` (`url_hash`);--> statement-breakpoint
CREATE INDEX `bookmarks_site_idx` ON `bookmarks` (`site`);--> statement-breakpoint
CREATE INDEX `bookmarks_folder_id_idx` ON `bookmarks` (`folder_id`);--> statement-breakpoint
CREATE INDEX `bookmarks_deleted_at_idx` ON `bookmarks` (`deleted_at`);--> statement-breakpoint
CREATE TABLE `folders` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`icon` text,
	`color` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_system` integer DEFAULT false NOT NULL,
	`system_key` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `folders_parent_id_idx` ON `folders` (`parent_id`);--> statement-breakpoint
CREATE TABLE `import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`file_name` text NOT NULL,
	`detected_browser` text NOT NULL,
	`total_parsed` integer NOT NULL,
	`imported` integer NOT NULL,
	`skipped_duplicates` integer NOT NULL,
	`imported_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);

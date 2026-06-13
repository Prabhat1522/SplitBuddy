-- SplitBuddy Relational Database Schema (MySQL)

-- Disable foreign key checks temporarily to drop tables in any order
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS `import_anomalies`;
DROP TABLE IF EXISTS `import_reports`;
DROP TABLE IF EXISTS `settlements`;
DROP TABLE IF EXISTS `expense_shares`;
DROP TABLE IF EXISTS `expenses`;
DROP TABLE IF EXISTS `group_members`;
DROP TABLE IF EXISTS `groups`;
DROP TABLE IF EXISTS `users`;
SET FOREIGN_KEY_CHECKS = 1;

-- 1. Users Table
CREATE TABLE `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_email` (`email`)
);

-- 2. Groups Table
CREATE TABLE `groups` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `description` TEXT NULL,
  `created_by` INT NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

-- 3. Group Members (Membership history supported via joined_at and left_at)
CREATE TABLE `group_members` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `group_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `joined_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `left_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  INDEX `idx_group_user` (`group_id`, `user_id`)
);

-- 4. Expenses (Supports multi-currency, tracks exchange rates and conversions)
CREATE TABLE `expenses` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `group_id` INT NOT NULL,
  `paid_by_id` INT NOT NULL,
  `description` VARCHAR(255) NOT NULL,
  `original_amount` DECIMAL(15, 2) NOT NULL,
  `original_currency` VARCHAR(10) NOT NULL DEFAULT 'INR',
  `exchange_rate` DECIMAL(15, 6) NOT NULL DEFAULT 1.000000, -- Rate to convert to INR (Amount * exchange_rate = INR)
  `converted_amount_inr` DECIMAL(15, 2) NOT NULL,
  `split_type` ENUM('EQUAL', 'EXACT', 'PERCENTAGE') NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL, -- Soft deletion
  FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`paid_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT,
  INDEX `idx_group_expenses` (`group_id`),
  INDEX `idx_deleted_at` (`deleted_at`)
);

-- 5. Expense Shares (Tracks owed shares in converted INR)
CREATE TABLE `expense_shares` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `expense_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `owed_amount_inr` DECIMAL(15, 2) NOT NULL,
  `percentage` DECIMAL(5, 2) NULL DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`expense_id`) REFERENCES `expenses`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT,
  UNIQUE KEY `uq_expense_share_user` (`expense_id`, `user_id`)
);

-- 6. Settlements (Recorded payments between members, stored in INR)
CREATE TABLE `settlements` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `group_id` INT NOT NULL,
  `payer_id` INT NOT NULL,
  `payee_id` INT NOT NULL,
  `amount_inr` DECIMAL(15, 2) NOT NULL,
  `recorded_by_id` INT NOT NULL,
  `settled_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`payer_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`payee_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`recorded_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT,
  INDEX `idx_group_settlements` (`group_id`)
);

-- 7. CSV Import Reports
CREATE TABLE `import_reports` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `group_id` INT NOT NULL,
  `uploaded_by_id` INT NOT NULL,
  `filename` VARCHAR(255) NOT NULL,
  `total_rows` INT NOT NULL DEFAULT 0,
  `processed_rows` INT NOT NULL DEFAULT 0,
  `anomalies_count` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`uploaded_by_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

-- 8. CSV Import Anomalies (Tracks rows containing anomalies, auditing resolved values and actions)
CREATE TABLE `import_anomalies` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `report_id` INT NOT NULL,
  `row_index` INT NOT NULL, -- Line number in CSV file
  `anomaly_type` VARCHAR(100) NOT NULL, -- e.g. DUPLICATE_EXPENSE, MISSING_PAYER, PERCENTAGE_OVER_100, etc.
  `detected_value` TEXT NOT NULL, -- JSON string or raw text representing what was found
  `resolved_value` TEXT NULL, -- JSON string or raw text representing what was inserted
  `action_taken` VARCHAR(255) NOT NULL, -- e.g. 'SKIPPED_ROW', 'CONVERTED_CURRENCY', 'ADJUSTED_PERCENTAGE', etc.
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`report_id`) REFERENCES `import_reports`(`id`) ON DELETE CASCADE
);

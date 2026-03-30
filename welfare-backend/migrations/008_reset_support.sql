ALTER TABLE welfare_settings
ADD COLUMN IF NOT EXISTS reset_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE welfare_settings
ADD COLUMN IF NOT EXISTS reset_threshold_balance NUMERIC(20, 6) NOT NULL DEFAULT 20;

ALTER TABLE welfare_settings
ADD COLUMN IF NOT EXISTS reset_target_balance NUMERIC(20, 6) NOT NULL DEFAULT 200;

ALTER TABLE welfare_settings
ADD COLUMN IF NOT EXISTS reset_cooldown_days INTEGER NOT NULL DEFAULT 7;

ALTER TABLE welfare_settings
ADD COLUMN IF NOT EXISTS reset_notice TEXT NOT NULL DEFAULT '当当前余额低于阈值时，可直接补到目标值。';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'welfare_settings_reset_threshold_nonnegative'
  ) THEN
    ALTER TABLE welfare_settings
      ADD CONSTRAINT welfare_settings_reset_threshold_nonnegative
      CHECK (reset_threshold_balance >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'welfare_settings_reset_target_positive'
  ) THEN
    ALTER TABLE welfare_settings
      ADD CONSTRAINT welfare_settings_reset_target_positive
      CHECK (reset_target_balance > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'welfare_settings_reset_cooldown_nonnegative'
  ) THEN
    ALTER TABLE welfare_settings
      ADD CONSTRAINT welfare_settings_reset_cooldown_nonnegative
      CHECK (reset_cooldown_days >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'welfare_settings_reset_target_gt_threshold'
  ) THEN
    ALTER TABLE welfare_settings
      ADD CONSTRAINT welfare_settings_reset_target_gt_threshold
      CHECK (reset_target_balance > reset_threshold_balance);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS welfare_reset_records (
  id BIGSERIAL PRIMARY KEY,
  sub2api_user_id BIGINT NOT NULL,
  sub2api_email TEXT NOT NULL,
  sub2api_username TEXT NOT NULL,
  linuxdo_subject TEXT NULL,
  before_balance NUMERIC(20, 6) NOT NULL,
  threshold_balance NUMERIC(20, 6) NOT NULL,
  target_balance NUMERIC(20, 6) NOT NULL,
  granted_balance NUMERIC(20, 6) NOT NULL,
  new_balance NUMERIC(20, 6) NULL,
  cooldown_days INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL,
  grant_status TEXT NOT NULL,
  grant_error TEXT NOT NULL DEFAULT '',
  sub2api_request_id TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT welfare_reset_records_status_valid CHECK (grant_status IN ('pending', 'success', 'failed')),
  CONSTRAINT welfare_reset_records_before_nonnegative CHECK (before_balance >= 0),
  CONSTRAINT welfare_reset_records_threshold_nonnegative CHECK (threshold_balance >= 0),
  CONSTRAINT welfare_reset_records_target_positive CHECK (target_balance > 0),
  CONSTRAINT welfare_reset_records_granted_positive CHECK (granted_balance > 0),
  CONSTRAINT welfare_reset_records_cooldown_nonnegative CHECK (cooldown_days >= 0)
);

CREATE INDEX IF NOT EXISTS idx_welfare_reset_records_user_created
  ON welfare_reset_records (sub2api_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_welfare_reset_records_status_created
  ON welfare_reset_records (grant_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_welfare_reset_records_subject
  ON welfare_reset_records (linuxdo_subject);

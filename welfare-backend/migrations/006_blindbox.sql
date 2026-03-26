ALTER TABLE welfare_settings
ADD COLUMN IF NOT EXISTS blindbox_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS welfare_blindbox_items (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  reward_balance NUMERIC(20, 6) NOT NULL,
  weight INTEGER NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT welfare_blindbox_items_reward_positive CHECK (reward_balance > 0),
  CONSTRAINT welfare_blindbox_items_weight_positive CHECK (weight > 0)
);

CREATE INDEX IF NOT EXISTS idx_welfare_blindbox_items_enabled_sort
  ON welfare_blindbox_items (enabled, sort_order ASC, id ASC);

ALTER TABLE welfare_checkins
ADD COLUMN IF NOT EXISTS checkin_mode TEXT NOT NULL DEFAULT 'normal';

ALTER TABLE welfare_checkins
ADD COLUMN IF NOT EXISTS blindbox_item_id BIGINT NULL REFERENCES welfare_blindbox_items (id);

ALTER TABLE welfare_checkins
ADD COLUMN IF NOT EXISTS blindbox_title TEXT NOT NULL DEFAULT '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'welfare_checkins_mode_valid'
  ) THEN
    ALTER TABLE welfare_checkins
      ADD CONSTRAINT welfare_checkins_mode_valid CHECK (checkin_mode IN ('normal', 'blindbox'));
  END IF;
END $$;

UPDATE welfare_checkins
SET checkin_mode = 'normal'
WHERE checkin_mode IS NULL OR checkin_mode = '';

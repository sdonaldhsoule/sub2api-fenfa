ALTER TABLE welfare_checkins
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE welfare_checkins
SET updated_at = created_at
WHERE updated_at IS NULL;

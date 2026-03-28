ALTER TABLE welfare_admin_whitelist
  ADD COLUMN IF NOT EXISTS sub2api_user_id BIGINT NULL,
  ADD COLUMN IF NOT EXISTS sub2api_email TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS sub2api_username TEXT NOT NULL DEFAULT '';

ALTER TABLE welfare_admin_whitelist
  ALTER COLUMN linuxdo_subject DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_welfare_admin_whitelist_user_id_unique
  ON welfare_admin_whitelist (sub2api_user_id)
  WHERE sub2api_user_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'welfare_checkins'
      AND column_name = 'synthetic_email'
  ) THEN
    ALTER TABLE welfare_checkins RENAME COLUMN synthetic_email TO sub2api_email;
  END IF;
END $$;

ALTER TABLE welfare_checkins
  ADD COLUMN IF NOT EXISTS sub2api_username TEXT NOT NULL DEFAULT '';

ALTER TABLE welfare_checkins
  ALTER COLUMN linuxdo_subject DROP NOT NULL;

UPDATE welfare_checkins
SET sub2api_username = COALESCE(NULLIF(sub2api_username, ''), NULLIF(linuxdo_subject, ''), sub2api_email)
WHERE sub2api_username = '';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'welfare_redeem_claims'
      AND column_name = 'synthetic_email'
  ) THEN
    ALTER TABLE welfare_redeem_claims RENAME COLUMN synthetic_email TO sub2api_email;
  END IF;
END $$;

ALTER TABLE welfare_redeem_claims
  ADD COLUMN IF NOT EXISTS sub2api_username TEXT NOT NULL DEFAULT '';

ALTER TABLE welfare_redeem_claims
  ALTER COLUMN linuxdo_subject DROP NOT NULL;

UPDATE welfare_redeem_claims
SET sub2api_username = COALESCE(NULLIF(sub2api_username, ''), NULLIF(linuxdo_subject, ''), sub2api_email)
WHERE sub2api_username = '';

CREATE INDEX IF NOT EXISTS idx_welfare_checkins_email
  ON welfare_checkins (sub2api_email);

CREATE INDEX IF NOT EXISTS idx_welfare_redeem_claims_email
  ON welfare_redeem_claims (sub2api_email);

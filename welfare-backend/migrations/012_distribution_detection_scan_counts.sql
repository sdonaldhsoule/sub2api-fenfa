ALTER TABLE welfare_risk_scan_state
  ADD COLUMN IF NOT EXISTS scanned_user_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hit_user_count INT NOT NULL DEFAULT 0;

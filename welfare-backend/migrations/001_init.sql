CREATE TABLE IF NOT EXISTS welfare_settings (
  id BIGINT PRIMARY KEY DEFAULT 1,
  checkin_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  daily_reward_balance NUMERIC(20, 6) NOT NULL DEFAULT 10,
  timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT welfare_settings_singleton CHECK (id = 1),
  CONSTRAINT welfare_settings_reward_positive CHECK (daily_reward_balance > 0)
);

INSERT INTO welfare_settings (id, checkin_enabled, daily_reward_balance, timezone)
VALUES (1, TRUE, 10, 'Asia/Shanghai')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS welfare_admin_whitelist (
  id BIGSERIAL PRIMARY KEY,
  linuxdo_subject TEXT NOT NULL UNIQUE,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS welfare_checkins (
  id BIGSERIAL PRIMARY KEY,
  sub2api_user_id BIGINT NOT NULL,
  linuxdo_subject TEXT NOT NULL,
  synthetic_email TEXT NOT NULL,
  checkin_date DATE NOT NULL,
  reward_balance NUMERIC(20, 6) NOT NULL,
  idempotency_key TEXT NOT NULL,
  grant_status TEXT NOT NULL,
  grant_error TEXT NOT NULL DEFAULT '',
  sub2api_request_id TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT welfare_checkins_unique_user_day UNIQUE (sub2api_user_id, checkin_date),
  CONSTRAINT welfare_checkins_status_valid CHECK (grant_status IN ('pending', 'success', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_welfare_checkins_date ON welfare_checkins (checkin_date DESC);
CREATE INDEX IF NOT EXISTS idx_welfare_checkins_created ON welfare_checkins (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_welfare_checkins_subject ON welfare_checkins (linuxdo_subject);

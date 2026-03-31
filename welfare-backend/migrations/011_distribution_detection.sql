CREATE TABLE IF NOT EXISTS welfare_user_security_states (
  sub2api_user_id BIGINT PRIMARY KEY,
  session_version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT welfare_user_security_states_session_version_positive
    CHECK (session_version >= 1)
);

CREATE TABLE IF NOT EXISTS welfare_risk_scan_state (
  id BIGINT PRIMARY KEY DEFAULT 1,
  last_started_at TIMESTAMPTZ NULL,
  last_finished_at TIMESTAMPTZ NULL,
  last_status TEXT NOT NULL DEFAULT 'idle',
  last_error TEXT NOT NULL DEFAULT '',
  last_trigger_source TEXT NOT NULL DEFAULT '',
  scanned_user_count BIGINT NOT NULL DEFAULT 0,
  hit_user_count BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT welfare_risk_scan_state_singleton CHECK (id = 1),
  CONSTRAINT welfare_risk_scan_state_status_valid
    CHECK (last_status IN ('idle', 'running', 'success', 'failed'))
);

INSERT INTO welfare_risk_scan_state (id, last_status)
VALUES (1, 'idle')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS welfare_risk_events (
  id BIGSERIAL PRIMARY KEY,
  sub2api_user_id BIGINT NOT NULL,
  sub2api_email TEXT NOT NULL DEFAULT '',
  sub2api_username TEXT NOT NULL DEFAULT '',
  linuxdo_subject TEXT NULL,
  sub2api_role TEXT NOT NULL DEFAULT 'user',
  sub2api_status TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL DEFAULT 'distribution_ip',
  status TEXT NOT NULL,
  window_started_at TIMESTAMPTZ NOT NULL,
  window_ended_at TIMESTAMPTZ NOT NULL,
  distinct_ip_count INT NOT NULL,
  ip_samples JSONB NOT NULL DEFAULT '[]'::jsonb,
  first_hit_at TIMESTAMPTZ NOT NULL,
  last_hit_at TIMESTAMPTZ NOT NULL,
  minimum_lock_until TIMESTAMPTZ NOT NULL,
  main_site_sync_status TEXT NOT NULL DEFAULT 'pending',
  main_site_sync_error TEXT NOT NULL DEFAULT '',
  last_scan_status TEXT NOT NULL DEFAULT 'success',
  last_scan_error TEXT NOT NULL DEFAULT '',
  last_scan_source TEXT NOT NULL DEFAULT '',
  last_scanned_at TIMESTAMPTZ NULL,
  released_by_sub2api_user_id BIGINT NULL,
  released_by_email TEXT NOT NULL DEFAULT '',
  released_by_username TEXT NOT NULL DEFAULT '',
  release_reason TEXT NOT NULL DEFAULT '',
  released_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT welfare_risk_events_type_valid
    CHECK (event_type = 'distribution_ip'),
  CONSTRAINT welfare_risk_events_status_valid
    CHECK (status IN ('active', 'pending_release', 'released')),
  CONSTRAINT welfare_risk_events_main_site_sync_status_valid
    CHECK (main_site_sync_status IN ('pending', 'success', 'failed')),
  CONSTRAINT welfare_risk_events_last_scan_status_valid
    CHECK (last_scan_status IN ('success', 'failed')),
  CONSTRAINT welfare_risk_events_distinct_ip_count_positive
    CHECK (distinct_ip_count >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_welfare_risk_events_open_user_unique
  ON welfare_risk_events (sub2api_user_id)
  WHERE status IN ('active', 'pending_release');

CREATE INDEX IF NOT EXISTS idx_welfare_risk_events_status_updated
  ON welfare_risk_events (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_welfare_risk_events_user_created
  ON welfare_risk_events (sub2api_user_id, created_at DESC);

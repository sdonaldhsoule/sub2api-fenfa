CREATE TABLE IF NOT EXISTS welfare_monitoring_snapshots (
  id BIGSERIAL PRIMARY KEY,
  snapshot_at TIMESTAMPTZ NOT NULL,
  request_count_24h BIGINT NOT NULL DEFAULT 0,
  active_user_count_24h INT NOT NULL DEFAULT 0,
  unique_ip_count_24h INT NOT NULL DEFAULT 0,
  observe_user_count_1h INT NOT NULL DEFAULT 0,
  blocked_user_count INT NOT NULL DEFAULT 0,
  pending_release_count INT NOT NULL DEFAULT 0,
  shared_ip_count_1h INT NOT NULL DEFAULT 0,
  shared_ip_count_24h INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_welfare_monitoring_snapshots_snapshot_at
  ON welfare_monitoring_snapshots (snapshot_at DESC);

CREATE TABLE IF NOT EXISTS welfare_monitoring_actions (
  id BIGSERIAL PRIMARY KEY,
  action_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id BIGINT NULL,
  target_label TEXT NOT NULL DEFAULT '',
  operator_sub2api_user_id BIGINT NOT NULL,
  operator_email TEXT NOT NULL DEFAULT '',
  operator_username TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  result_status TEXT NOT NULL DEFAULT 'success',
  detail TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT welfare_monitoring_actions_action_type_valid
    CHECK (action_type IN ('disable_user', 'enable_user', 'release_risk_event', 'run_risk_scan')),
  CONSTRAINT welfare_monitoring_actions_target_type_valid
    CHECK (target_type IN ('user', 'risk_event', 'scan')),
  CONSTRAINT welfare_monitoring_actions_result_status_valid
    CHECK (result_status IN ('success', 'failed', 'blocked'))
);

CREATE INDEX IF NOT EXISTS idx_welfare_monitoring_actions_created_at
  ON welfare_monitoring_actions (created_at DESC);

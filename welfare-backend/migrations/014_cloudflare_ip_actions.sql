ALTER TABLE welfare_monitoring_actions
  DROP CONSTRAINT IF EXISTS welfare_monitoring_actions_action_type_valid;

ALTER TABLE welfare_monitoring_actions
  ADD CONSTRAINT welfare_monitoring_actions_action_type_valid
    CHECK (
      action_type IN (
        'disable_user',
        'enable_user',
        'release_risk_event',
        'run_risk_scan',
        'cloudflare_challenge_ip',
        'cloudflare_block_ip',
        'cloudflare_unblock_ip'
      )
    );

ALTER TABLE welfare_monitoring_actions
  DROP CONSTRAINT IF EXISTS welfare_monitoring_actions_target_type_valid;

ALTER TABLE welfare_monitoring_actions
  ADD CONSTRAINT welfare_monitoring_actions_target_type_valid
    CHECK (target_type IN ('user', 'risk_event', 'scan', 'ip'));

import type { CheckinMode } from '../types';

export function getModeLabel(mode: CheckinMode): string {
  return mode === 'blindbox' ? '惊喜签到' : '普通签到';
}

export function renderGrantTag(status: 'success' | 'pending' | 'failed') {
  const label = status === 'success' ? '成功' : status === 'pending' ? '处理中' : '失败';
  return <span className={`status-tag ${status}`}>{label}</span>;
}

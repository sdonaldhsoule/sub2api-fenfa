import { Icon } from './Icon';
import type { AdminCheckinItem, AdminRedeemClaimItem, AdminRedeemCodeItem, AdminSettings, DailyStats, WhitelistItem } from '../types';

interface AdminDashboardOverviewProps {
  settings: AdminSettings | null;
  stats: DailyStats | null;
  whitelist: WhitelistItem[];
  redeemCodes: AdminRedeemCodeItem[];
  failedCheckins: AdminCheckinItem[];
  failedCheckinsTotal: number;
  failedRedeemClaims: AdminRedeemClaimItem[];
  failedRedeemClaimsTotal: number;
  onOpenCheckins: () => void;
  onOpenRedeemCodes: () => void;
  onOpenRedeemClaims: () => void;
}

function renderGrantTag(status: 'success' | 'pending' | 'failed') {
  const label = status === 'success' ? '成功' : status === 'pending' ? '处理中' : '失败';
  return <span className={`status-tag ${status}`}>{label}</span>;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return '未设置';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function isExpiringSoon(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }

  const expiresAt = Date.parse(value);
  if (Number.isNaN(expiresAt)) {
    return false;
  }

  const diff = expiresAt - Date.now();
  return diff > 0 && diff <= 7 * 24 * 60 * 60 * 1000;
}

export function AdminDashboardOverview({
  settings,
  stats,
  whitelist,
  redeemCodes,
  failedCheckins,
  failedCheckinsTotal,
  failedRedeemClaims,
  failedRedeemClaimsTotal,
  onOpenCheckins,
  onOpenRedeemCodes,
  onOpenRedeemClaims
}: AdminDashboardOverviewProps) {
  const activeRedeemCodes = redeemCodes.filter((item) => item.enabled && !item.isExpired);
  const expiringRedeemCodes = redeemCodes.filter((item) => isExpiringSoon(item.expiresAt));
  const hottestRedeemCodes = [...redeemCodes]
    .sort((left, right) => right.claimedCount - left.claimedCount)
    .slice(0, 3);
  const statsMaxGrant = Math.max(...(stats?.points.map((point) => point.grantTotal) ?? [0]), 1);
  const latestPoints = [...(stats?.points ?? [])].slice(-6).reverse();
  const urgentTotal = failedCheckinsTotal + failedRedeemClaimsTotal;

  return (
    <div className="admin-section-stack">
      <div className="admin-hero-grid">
        <section className="admin-surface admin-hero-panel">
          <div className="admin-surface-kicker">Control Room</div>
          <div className="admin-hero-copy">
            <h2>福利站今天的运行节奏</h2>
            <p>
              把异常处理、活动码管理和签到配置放进一个工作台里，先看系统态势，再进入具体业务流。
            </p>
          </div>
          <div className="admin-hero-actions">
            <button className="button primary" onClick={onOpenRedeemCodes}>
              创建兑换码
            </button>
            <button className="button" onClick={onOpenCheckins}>
              查看签到流水
            </button>
            <button className="button ghost" onClick={onOpenRedeemClaims}>
              处理失败补发
            </button>
          </div>
        </section>

        <section className="admin-surface admin-watch-panel">
          <div className="admin-surface-kicker">今日观察</div>
          <div className="admin-watch-list">
            <div className="admin-watch-item">
              <span>签到功能</span>
              <strong className={settings?.checkin_enabled ? 'tone-good' : 'tone-bad'}>
                {settings?.checkin_enabled ? '开启中' : '已关闭'}
              </strong>
            </div>
            <div className="admin-watch-item">
              <span>需处理异常</span>
              <strong className={urgentTotal > 0 ? 'tone-bad' : 'tone-good'}>
                {urgentTotal} 条
              </strong>
            </div>
            <div className="admin-watch-item">
              <span>活跃兑换码</span>
              <strong>{activeRedeemCodes.length} 个</strong>
            </div>
            <div className="admin-watch-item">
              <span>白名单管理员</span>
              <strong>{whitelist.length} 人</strong>
            </div>
          </div>
        </section>
      </div>

      <div className="admin-metric-grid">
        <article className="admin-metric-card">
          <span>每日奖励</span>
          <strong>{settings?.daily_reward_balance ?? '-'}</strong>
          <p>当前按业务时区自动发放</p>
        </article>
        <article className="admin-metric-card">
          <span>业务时区</span>
          <strong>{settings?.timezone ?? '-'}</strong>
          <p>决定签到业务日边界</p>
        </article>
        <article className="admin-metric-card">
          <span>30 天签到用户</span>
          <strong>{stats?.active_users ?? 0}</strong>
          <p>活跃用户去重统计</p>
        </article>
        <article className="admin-metric-card">
          <span>30 天签到人次</span>
          <strong>{stats?.total_checkins ?? 0}</strong>
          <p>含重复用户的签到流水</p>
        </article>
        <article className="admin-metric-card">
          <span>30 天发放总额</span>
          <strong>{stats?.total_grant_balance ?? 0}</strong>
          <p>签到累计发放额度</p>
        </article>
        <article className="admin-metric-card">
          <span>兑换码总数</span>
          <strong>{redeemCodes.length}</strong>
          <p>{expiringRedeemCodes.length} 个即将过期</p>
        </article>
      </div>

      <div className="admin-overview-grid">
        <section className="admin-surface admin-surface-wide">
          <div className="admin-panel-head">
            <div>
              <h3>最近 30 天签到热度</h3>
              <p>按日查看签到人数和发放额度，方便快速识别活动波峰。</p>
            </div>
            <span className="chip">近 {latestPoints.length} 个业务日</span>
          </div>
          <div className="admin-trend-list">
            {latestPoints.length === 0 && (
              <div className="empty-state">最近 30 天还没有可展示的签到数据。</div>
            )}
            {latestPoints.map((point) => (
              <div key={point.checkinDate} className="admin-trend-row">
                <div className="admin-trend-label">
                  <strong>{point.checkinDate}</strong>
                  <span>{point.checkinUsers} 人签到</span>
                </div>
                <div className="admin-trend-bar">
                  <span
                    style={{
                      width: `${Math.max(12, (point.grantTotal / statsMaxGrant) * 100)}%`
                    }}
                  />
                </div>
                <strong className="admin-trend-value">{point.grantTotal}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="admin-surface">
          <div className="admin-panel-head">
            <div>
              <h3>热门兑换码</h3>
              <p>优先看消耗最快的活动码。</p>
            </div>
          </div>
          <div className="admin-mini-list">
            {hottestRedeemCodes.length === 0 && <div className="empty-state">暂无兑换码数据</div>}
            {hottestRedeemCodes.map((item) => (
              <div key={item.id} className="admin-mini-item">
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.code}</span>
                </div>
                <div className="admin-mini-item-tail">
                  <strong>
                    {item.claimedCount} / {item.maxClaims}
                  </strong>
                  <span>剩余 {item.remainingClaims}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="admin-surface">
          <div className="admin-panel-head">
            <div>
              <h3>最近失败签到</h3>
              <p>需要人工复核或补发的签到流水。</p>
            </div>
            <span className="chip warn">{failedCheckinsTotal} 条</span>
          </div>
          <div className="admin-mini-list">
            {failedCheckins.length === 0 && <div className="empty-state">当前没有失败签到。</div>}
            {failedCheckins.map((item) => (
              <div key={item.id} className="admin-mini-item">
                <div>
                  <strong>{item.linuxdoSubject}</strong>
                  <span>{item.checkinDate}</span>
                </div>
                <div className="admin-mini-item-tail">{renderGrantTag(item.grantStatus)}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="admin-surface">
          <div className="admin-panel-head">
            <div>
              <h3>最近失败兑换</h3>
              <p>优先处理码已占用但发放失败的记录。</p>
            </div>
            <span className="chip warn">{failedRedeemClaimsTotal} 条</span>
          </div>
          <div className="admin-mini-list">
            {failedRedeemClaims.length === 0 && <div className="empty-state">当前没有失败兑换。</div>}
            {failedRedeemClaims.map((item) => (
              <div key={item.id} className="admin-mini-item">
                <div>
                  <strong>{item.redeemCode}</strong>
                  <span>{item.linuxdoSubject}</span>
                </div>
                <div className="admin-mini-item-tail">{renderGrantTag(item.grantStatus)}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="admin-surface">
          <div className="admin-panel-head">
            <div>
              <h3>即将过期兑换码</h3>
              <p>未来 7 天内到期，适合提前续期或下线。</p>
            </div>
          </div>
          <div className="admin-mini-list">
            {expiringRedeemCodes.length === 0 && (
              <div className="empty-state">最近没有即将过期的兑换码。</div>
            )}
            {expiringRedeemCodes.slice(0, 4).map((item) => (
              <div key={item.id} className="admin-mini-item">
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.code}</span>
                </div>
                <div className="admin-mini-item-tail">
                  <strong>{formatDateTime(item.expiresAt)}</strong>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

import { buildLinuxDoStartUrl } from '../lib/api';

export function LoginPage() {
  return (
    <div className="page page-center">
      <div className="card auth-card">
        <p className="eyebrow">WELFARE NODE</p>
        <h1 className="hero-title">sub2api 福利站</h1>
        <p className="muted lead">
          使用 LinuxDo 登录后自动匹配 sub2api 账号。通过每日签到发放额度，并提供独立后台管理奖励规则。
        </p>

        <div className="feature-list">
          <div className="feature-item">
            <strong>账号联动</strong>
            <span>按 LinuxDo subject 精准识别 sub2api 用户</span>
          </div>
          <div className="feature-item">
            <strong>签到发放</strong>
            <span>调用 sub2api 管理接口并附带幂等键</span>
          </div>
          <div className="feature-item">
            <strong>后台管理</strong>
            <span>可配置开关、奖励值、时区与管理员白名单</span>
          </div>
        </div>

        <a className="button primary wide" href={buildLinuxDoStartUrl('/checkin')}>
          使用 LinuxDo 登录
        </a>
      </div>
    </div>
  );
}

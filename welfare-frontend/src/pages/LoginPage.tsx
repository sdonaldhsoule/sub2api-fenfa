import { buildLinuxDoStartUrl } from '../lib/api';

export function LoginPage() {
  return (
    <div className="page">
      <div className="card">
        <h1>sub2api 福利站</h1>
        <p className="muted">使用 LinuxDo 登录，且仅已存在 sub2api 账号可签到。</p>
        <a className="button primary" href={buildLinuxDoStartUrl('/checkin')}>
          使用 LinuxDo 登录
        </a>
      </div>
    </div>
  );
}


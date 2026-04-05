# welfare-backend

`welfare-backend` 是福利站后端服务，负责：

- LinuxDo OAuth 登录与一次性交接码签发
- 前端 Bearer 会话校验
- sub2api 用户识别与签到/兑换额度发放
- 签到配置管理、签到记录统计、管理员白名单管理

## 环境变量

基于 `.env.example` 配置，关键变量如下：

- 服务与安全
  - `PORT`：后端端口
  - `WELFARE_FRONTEND_URL`：前端地址，用于 OAuth 回跳；支持带子路径，如 `https://example.com/welfare/`
  - `WELFARE_CORS_ORIGINS`：允许跨域来源，多个值用逗号分隔；留空时默认仅允许 `WELFARE_FRONTEND_URL` 对应的 origin
  - `WELFARE_JWT_SECRET`：会话签名密钥，至少 16 位
  - `WELFARE_JWT_EXPIRES_IN`：Bearer JWT 过期时间，如 `30m`、`12h`、`24h`
  - `WELFARE_RATE_LIMIT_AUTH_WINDOW` / `WELFARE_RATE_LIMIT_AUTH_LIMIT`：登录相关接口限流窗口与次数
  - `WELFARE_RATE_LIMIT_CHECKIN_WINDOW` / `WELFARE_RATE_LIMIT_CHECKIN_LIMIT`：签到接口限流窗口与次数
  - `WELFARE_RATE_LIMIT_REDEEM_WINDOW` / `WELFARE_RATE_LIMIT_REDEEM_LIMIT`：兑换接口限流窗口与次数
  - `WELFARE_RATE_LIMIT_ADMIN_MUTATION_WINDOW` / `WELFARE_RATE_LIMIT_ADMIN_MUTATION_LIMIT`：后台写操作限流窗口与次数

- 数据库
  - `DATABASE_URL`：PostgreSQL 连接串

- LinuxDo OAuth
  - `LINUXDO_CLIENT_ID`
  - `LINUXDO_CLIENT_SECRET`
  - `LINUXDO_AUTHORIZE_URL`
  - `LINUXDO_TOKEN_URL`
  - `LINUXDO_USERINFO_URL`
  - `LINUXDO_REDIRECT_URI`
  - `LINUXDO_SCOPE`

- sub2api 集成
  - `SUB2API_BASE_URL`：sub2api 服务地址
  - `SUB2API_ADMIN_API_KEY`：sub2api 管理接口密钥
  - `SUB2API_TIMEOUT_MS`：请求超时毫秒数
  - `WELFARE_REVOKED_TOKEN_CLEANUP_INTERVAL`：清理已过期撤销 token 的周期，默认 `6h`

- Cloudflare IP 处置（可选）
  - `CLOUDFLARE_API_TOKEN`：Cloudflare API Token
  - `CLOUDFLARE_ZONE_ID`：要操作的 Zone ID
  - `CLOUDFLARE_TIMEOUT_MS`：Cloudflare API 请求超时毫秒数，默认 `10000`
  - 只配置一半时不会阻止服务启动，但监控后台的 Cloudflare IP 处置会显示为未配置

- 福利默认配置
  - `DEFAULT_CHECKIN_ENABLED`
  - `DEFAULT_DAILY_REWARD`
  - `DEFAULT_TIMEZONE`：默认 `Asia/Shanghai`，启动时会校验合法性
  - `BOOTSTRAP_ADMIN_USER_IDS`：推荐使用，启动时按 sub2api 用户 ID 自动写入管理员白名单，逗号分隔
  - `BOOTSTRAP_ADMIN_SUBJECTS`：旧版兼容配置，启动后会尝试按 LinuxDo subject 回填到 sub2api 用户 ID

## 运行方式

```bash
npm install
cp .env.example .env
npm run dev
```

生产构建：

```bash
npm run build
npm start
```

测试：

```bash
npm test
```

## 当前行为说明

- 登录回调成功后，后端不会写 Cookie，而是向前端回跳并附带一次性交接码
- OAuth `state` 与前端 `session handoff` 都是服务端登记的一次性工件，消费后立即失效，用于降低重放风险
- 前端再调用 `POST /api/auth/session-handoff/exchange` 换取 Bearer session token，并存入本地存储
- 如果页面由 sub2api 内置页或带 token 的外链打开，前端会调用 `POST /api/auth/sub2api/exchange` 直接换取福利站 session token
- 后端鉴权统一读取 `Authorization: Bearer <token>`
- JWT 过期时间由 `WELFARE_JWT_EXPIRES_IN` 控制，默认回退值已收紧为 `12h`
- `POST /api/auth/logout` 会在服务端撤销当前 Bearer token；后台还会按 `WELFARE_REVOKED_TOKEN_CLEANUP_INTERVAL` 定期清理已过期的撤销记录
- 登录、签到、兑换和后台写操作都已加入基础限流；如果对外暴露到公网，仍建议在 Nginx / CDN / WAF 层再加一层限流
- 布尔环境变量会严格校验，拼错值会在启动时报错，而不是静默当成 `false`
- 默认业务时区与启动白名单会在启动阶段校验，避免运行时才因非法配置报错
- 监控主控台支持对单个共享 IP 发起 Cloudflare `托管质询 / 直接封禁 / 解除`
- 为避免误封，后台只会接管由福利站自己创建的 Cloudflare IP 规则；若检测到外部已有规则或多个规则，会明确提示去 Cloudflare 后台人工处理
- 签到记录新增 `updated_at`，用于识别超时 `pending` 记录
- 用户重试签到时，若遇到超时的 `pending` 记录，系统会自动接管并继续发放流程
- 失败签到重试会保留原始 `reward_balance`，不会因为后台后来改了奖励配置而漂移
- 管理后台“最近 N 天”统计按业务时区推导起始日期，不依赖数据库 `CURRENT_DATE`
- `WELFARE_FRONTEND_URL` 支持子路径部署，OAuth 回调会保留前端 base path

## 安全说明

- API 默认会返回基础安全响应头：`Content-Security-Policy: frame-ancestors 'self' <sub2api-origin>`、`X-Content-Type-Options: nosniff`、`Referrer-Policy: same-origin`
- 当前仓库内的限流实现是**进程内存级**的，适合单实例或作为兜底保护；多实例生产环境建议把主限流放到反向代理、网关或 WAF
- 如果服务部署在反向代理后，请正确配置真实客户端 IP 透传，否则基于 IP 的登录限流可能偏保守
- 前端当前使用 localStorage 保存 Bearer token，生产部署时建议额外启用 CSP、限制第三方脚本来源，并避免把不可信 HTML 注入页面

## 数据库行为

- 启动时自动执行 `migrations/*.sql`
- 启动后会立即执行一次过期撤销 token 清理，并按配置周期继续后台清理
- 首次自动写入 `welfare_settings` 默认配置
- 签到流水写入 `welfare_checkins`
- 兑换码写入 `welfare_redeem_codes` 与 `welfare_redeem_claims`
- 通过 `(sub2api_user_id, checkin_date)` 保证每日唯一签到
- 通过 `(redeem_code_id, sub2api_user_id)` 保证每个用户对同一兑换码只能领取一次
- `welfare_checkins.updated_at` 与 `welfare_redeem_claims.updated_at` 用于恢复超时未完成的发放状态

## 核心接口

### 鉴权

- `GET /api/auth/linuxdo/start`：跳转 LinuxDo 登录，并创建一次性 `state`
- `GET /api/auth/linuxdo/callback`：处理 OAuth 回调，消费一次性 `state`，再回跳前端 `/auth/callback` 并在 URL hash 中附带一次性交接码
- `POST /api/auth/session-handoff/exchange`：把前端回调页拿到的一次性交接码换成 session token；交接码仅可使用一次
- `POST /api/auth/sub2api/exchange`：把 sub2api 内置页或外链携带的 `access_token` 换成福利站 session token
- `GET /api/auth/me`：返回当前会话信息，包含 `is_admin`
- `POST /api/auth/logout`：退出登录，并在服务端撤销当前 Bearer token（前端随后清理本地 token）

### 签到

- `GET /api/checkin/status`：今日签到状态，返回 `can_checkin` 供前端判断是否可再次发起
- `GET /api/checkin/history`：签到历史
- `POST /api/checkin`：执行签到并发放额度

### 兑换码

- `GET /api/redeem-codes/history`：当前用户兑换历史
- `POST /api/redeem-codes/redeem`：提交兑换码并发放额度

### 管理后台

- `GET /api/admin/overview`：一次性读取总览卡片所需的数据
- `GET /api/admin/settings`：读取签到配置
- `PUT /api/admin/settings`：更新签到配置
- `GET /api/admin/stats/daily`：按天统计
- `GET /api/admin/checkins`：分页查询签到明细
- `POST /api/admin/checkins/:id/retry`：重试失败签到，或接管已超时的 `pending` 签到
- `GET /api/admin/sub2api-users/search`：搜索 sub2api 用户，用于添加管理员白名单
- `GET /api/admin/whitelist`：管理员白名单列表
- `POST /api/admin/whitelist`：新增或更新白名单
- `DELETE /api/admin/whitelist/:id`：删除白名单
- `GET /api/admin/redeem-codes`：兑换码列表
- `POST /api/admin/redeem-codes`：创建兑换码
- `PATCH /api/admin/redeem-codes/:id`：更新兑换码
- `GET /api/admin/redeem-claims`：分页查询兑换记录
- `POST /api/admin/redeem-claims/:id/retry`：重试失败兑换

## 与 sub2api 的对接细节

- 用户识别规则：`linuxdo-{subject}@linuxdo-connect.invalid`
- 查询用户：`GET /api/v1/admin/users?search=<synthetic_email>`
- 读取当前登录用户：`GET /api/v1/auth/me`
- 发放额度：`POST /api/v1/admin/users/:id/balance`
- 签到幂等键：`Idempotency-Key: welfare-checkin:{userId}:{checkinDate}`
- 兑换幂等键：`Idempotency-Key: welfare-redeem:{redeemCodeId}:{userId}`

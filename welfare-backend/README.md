# welfare-backend

`welfare-backend` 是福利站后端服务，负责：

- LinuxDo OAuth 登录与会话签发
- sub2api 用户识别与签到额度发放
- 签到配置管理、签到记录统计、管理员白名单管理

## 环境变量

基于 `.env.example` 配置，关键变量如下：

- 服务与安全
  - `PORT`：后端端口
  - `WELFARE_FRONTEND_URL`：前端地址（用于 OAuth 回跳）
  - `WELFARE_CORS_ORIGINS`：允许跨域来源（逗号分隔）
  - `WELFARE_JWT_SECRET`：会话签名密钥（至少 16 位）
  - `WELFARE_JWT_EXPIRES_IN`：JWT 过期时间（如 `7d`）
  - `WELFARE_COOKIE_SECURE`：生产建议 `true`

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
  - `SUB2API_TIMEOUT_MS`：请求超时

- 福利默认配置
  - `DEFAULT_CHECKIN_ENABLED`
  - `DEFAULT_DAILY_REWARD`
  - `DEFAULT_TIMEZONE`（默认 `Asia/Shanghai`）
  - `BOOTSTRAP_ADMIN_SUBJECTS`：启动自动写入管理员白名单（逗号分隔）

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

## 数据库行为

- 启动时自动执行 `migrations/*.sql`
- 首次自动写入 `welfare_settings` 默认配置
- 签到流水写入 `welfare_checkins`，并通过 `(sub2api_user_id, checkin_date)` 保证每日唯一

## 核心接口

### 鉴权

- `GET /api/auth/linuxdo/start`：跳转 LinuxDo 登录
- `GET /api/auth/linuxdo/callback`：处理 OAuth 回调，签发福利站 token
- `GET /api/auth/me`：返回当前会话信息（含 `is_admin`）
- `POST /api/auth/logout`：退出登录

### 签到

- `GET /api/checkin/status`：今日签到状态
- `GET /api/checkin/history`：签到历史
- `POST /api/checkin`：执行签到并发放额度

### 管理后台

- `GET /api/admin/settings`：读取签到配置
- `PUT /api/admin/settings`：更新签到配置（开关/奖励/时区）
- `GET /api/admin/stats/daily`：按天统计
- `GET /api/admin/checkins`：分页查询签到明细
- `GET /api/admin/whitelist`：管理员白名单列表
- `POST /api/admin/whitelist`：新增/更新白名单
- `DELETE /api/admin/whitelist/:id`：删除白名单

## 与 sub2api 的对接细节

- 用户识别规则：  
  `linuxdo-{subject}@linuxdo-connect.invalid`
- 查询用户：  
  `GET /api/v1/admin/users?search=<synthetic_email>`
- 发放额度：  
  `POST /api/v1/admin/users/:id/balance`
- 幂等键：  
  `Idempotency-Key: welfare-checkin:{userId}:{checkinDate}`

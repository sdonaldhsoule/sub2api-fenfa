# welfare-frontend

`welfare-frontend` 是福利站前端，基于 React + Vite。

## 环境变量

`.env.example`：

- `VITE_WELFARE_API_BASE`：福利后端地址（如 `http://localhost:8787`）

## 运行方式

```bash
npm install
cp .env.example .env
npm run dev
```

生产构建：

```bash
npm run build
npm run preview
```

## 页面与路由

- `/login`：登录入口（跳转后端 `GET /api/auth/linuxdo/start`）
- `/auth/callback`：OAuth 回跳页（解析 hash 中 `token/error`）
- `/checkin`：签到页（今日状态 + 签到历史）
- `/admin`：管理员页（配置、统计、白名单）

## 鉴权策略

- 令牌存储：`localStorage`（键名 `welfare_token`）
- API 请求同时携带：
  - `Authorization: Bearer <token>`
  - `credentials: include`（兼容后端 cookie）
- 遇到 `401` 会自动清理本地 token 并回登录页

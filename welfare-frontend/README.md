# welfare-frontend

`welfare-frontend` 是福利站前端，基于 React + Vite。

## 环境变量

`.env.example`：

- `VITE_WELFARE_API_BASE`：福利后端地址，如 `http://localhost:8787`

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

- `/login`：登录入口，跳转后端 `GET /api/auth/linuxdo/start`
- `/auth/callback`：OAuth 回调页，只负责处理错误提示与会话校验
- `/checkin`：签到页，展示今日状态与签到历史
- `/admin`：管理员页，展示配置、统计、白名单

## 鉴权策略

- 不再把会话 token 存进 `localStorage`
- 仅使用后端设置的 `HttpOnly Cookie` 维持登录态
- 前端通过 `GET /api/auth/me` 刷新当前会话状态
- 所有 API 请求统一携带 `credentials: include`
- 遇到 `401` 时会自动回到登录页

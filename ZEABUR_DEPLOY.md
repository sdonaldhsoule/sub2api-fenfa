# Zeabur Docker 部署说明

本项目推荐在 Zeabur 上按下面的形态部署：

- `1 个 Docker 应用服务`
- `1 个 PostgreSQL 服务`

不需要再单独部署前端服务。

## 1. 创建服务

1. 在 Zeabur 新建一个 Project
2. 添加一个 `PostgreSQL` 服务
3. 从当前 Git 仓库新增一个应用服务
4. 仓库根目录存在 `Dockerfile`，Zeabur 会按 Docker 方式构建

## 2. 环境变量

后端运行时必须配置：

```env
NODE_ENV=production
DATABASE_URL=${POSTGRES_CONNECTION_STRING}
WELFARE_FRONTEND_URL=https://your-app.zeabur.app
WELFARE_CORS_ORIGINS=https://your-app.zeabur.app
WELFARE_JWT_SECRET=replace-with-strong-secret

LINUXDO_CLIENT_ID=your-linuxdo-client-id
LINUXDO_CLIENT_SECRET=your-linuxdo-client-secret
LINUXDO_AUTHORIZE_URL=https://connect.linux.do/oauth2/authorize
LINUXDO_TOKEN_URL=https://connect.linux.do/oauth2/token
LINUXDO_USERINFO_URL=https://connect.linux.do/api/user
LINUXDO_REDIRECT_URI=https://your-app.zeabur.app/api/auth/linuxdo/callback
LINUXDO_SCOPE=user

SUB2API_BASE_URL=https://your-sub2api.example.com
SUB2API_ADMIN_API_KEY=your-sub2api-admin-api-key

# 可选：监控后台直接操作 Cloudflare 单 IP 规则
CLOUDFLARE_API_TOKEN=your-cloudflare-api-token
CLOUDFLARE_ZONE_ID=your-cloudflare-zone-id
CLOUDFLARE_TIMEOUT_MS=10000

DEFAULT_TIMEZONE=Asia/Shanghai
BOOTSTRAP_ADMIN_USER_IDS=
BOOTSTRAP_ADMIN_EMAILS=
BOOTSTRAP_ADMIN_SUBJECTS=
```

前端在生产镜像内会直接编译为同源模式，一般**不需要**额外设置 `VITE_WELFARE_API_BASE`。

说明：

- 福利站页面的 iframe 嵌入白名单会自动跟随 `SUB2API_BASE_URL` 的域名
- 如果你要在 sub2api 后台自定义菜单里嵌入福利站，`SUB2API_BASE_URL` 必须填你实际访问 sub2api 的那个 HTTPS 域名
- `CLOUDFLARE_*` 留空时，监控后台里的 Cloudflare IP 处置区域会显示未配置，但不会影响主服务启动
- Cloudflare Token 建议最小权限只给目标 Zone，至少包含 `Zone WAF Edit`
- 当前面板只接管“福利站自己创建的 Cloudflare IP 规则”；如果某个 IP 已经有外部手工规则，面板会拒绝覆盖，避免误封

## 3. 域名与回调

- 对外只暴露一个域名
- 页面、API、OAuth 回调都走同一域名
- LinuxDo OAuth 回调地址填写：

```text
https://your-app.zeabur.app/api/auth/linuxdo/callback
```

## 4. 首次上线后验证

1. 访问 `/healthz`，确认服务正常
2. 打开 `/login`，确认前端页面由同一个域名返回
3. 完成一次 LinuxDo 登录
4. 确认能进入 `/checkin`
5. 配置管理员后访问 `/admin`
6. 实测一次签到或兑换流程

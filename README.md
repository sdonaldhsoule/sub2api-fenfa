# sub2api 福利站（独立部署版）

本仓库实现了一个**不改动 `sub2api` 源码**的福利站方案，包含：

- `welfare-backend`：签到业务、LinuxDo 登录、管理员配置
- `welfare-frontend`：签到页与管理后台页

## 当前版本补充

- 后端已加入**超时 `pending` 签到恢复机制**，异常中断后不再只能手工改库
- 签到失败重试会保留**原始奖励额度**，避免奖励随配置漂移
- 管理后台统计按**业务时区**计算，不再受数据库时区影响
- 前端已补上**管理员路由守卫**、**登录后原路返回**和**会话错误态**
- 前后端都已补充自动化测试入口

## 架构说明

核心设计是“零侵入 sub2api”：

1. 用户在福利站通过 LinuxDo OAuth 登录；
2. 福利后台将 LinuxDo `subject` 映射为合成邮箱：`linuxdo-{subject}@linuxdo-connect.invalid`；
3. 后台调用 `sub2api` 管理接口确认该邮箱用户存在；
4. 签到时后台调用 `POST /api/v1/admin/users/:id/balance` 发放额度；
5. 签到配置（开关、每日额度、时区）和管理员白名单都由福利后台独立维护。

## 目录结构

```text
.
├── welfare-backend
│   ├── migrations
│   └── src
└── welfare-frontend
    └── src
```

## 快速开始

### 1) 启动后端

```bash
cd welfare-backend
cp .env.example .env
npm install
npm run dev
```

> 后端启动时会自动执行数据库迁移并按需写入管理员白名单种子。

### 2) 启动前端

```bash
cd welfare-frontend
cp .env.example .env
npm install
npm run dev
```

## 测试与构建

后端：

```bash
cd welfare-backend
npm test
npm run build
```

前端：

```bash
cd welfare-frontend
npm test
npm run build
```

## 对接要点

- `SUB2API_BASE_URL`：你的 sub2api 服务地址
- `SUB2API_ADMIN_API_KEY`：sub2api 后台管理员 API Key
- `LINUXDO_*`：LinuxDo OAuth 应用参数，回调需指向  
  `http(s)://<welfare-backend>/api/auth/linuxdo/callback`

## 更多说明

- 后端详细配置与接口：`welfare-backend/README.md`
- 前端运行与页面说明：`welfare-frontend/README.md`

# 邮箱账号管理系统 — 使用说明

## 1. 系统概述

多邮箱账号管理系统，支持 Gmail / Outlook / Hotmail 账号的邮件收发，提供 Web 界面操作。

## 2. 启动服务

```bash
# 后端（端口 3002）
cd mail-backend
npx tsx watch src/server.ts

# 前端（端口 5173）
cd frontend
npx vite --host 0.0.0.0 --port 5173
```

启动后浏览器打开：http://localhost:5173

## 3. 使用流程

### 3.1 登录系统

首次打开会进入「登录与账户绑定」页面：

- **用户名**：`admin`
- **密码**：`admin1234567890x`（见 `mail-backend/.env` 中 `API_ADMIN_PASSWORD`）

登录后会看到「已认证」绿色标签。

### 3.2 绑定邮箱账户

登录后可绑定 Gmail 或 Outlook/Hotmail 账户：

1. 在「登录与账户绑定」页面，找到对应提供商卡片
2. 点击「绑定账户」按钮
3. 跳转到 Google/Microsoft 登录页面完成授权
4. 授权成功后自动返回，账户出现在「已绑定账户」列表

#### Gmail 前置条件

需在 [Google Cloud Console](https://console.cloud.google.com/apis/credentials) 配置：

- OAuth 2.0 客户端 ID：`268838574870-e839o69mrck0m3vd84ohfo9l1coj9mam`
- 已获授权的重定向 URI 必须包含：
  ```
  http://localhost:3002/api/v1/accounts/oauth/google/callback
  ```

#### Microsoft 前置条件

需在 Azure Portal 配置 App Registration，并在 `.env` 中填写：
```
MICROSOFT_CLIENT_ID=<你的客户端ID>
MICROSOFT_CLIENT_SECRET=<你的客户端密钥>
```

### 3.3 查看收件箱

绑定账户后，点击顶部导航「收件箱」：

- **统一收件箱**：合并显示所有账户的邮件
- **单账户模式**：左侧点击特定账户切换
- **文件夹**：收件箱 / 已标星 / 已发送 / 草稿 / 归档
- **筛选**：顶部可按 全部 / 未读 / 已标星 / 附件 筛选
- **搜索**：按主题、发件人或预览内容搜索

### 3.4 撰写/回复/转发邮件

点击顶部「撰写」或邮件详情中的「回复」/「转发」：

1. 选择发件账户
2. 填写收件人、抄送、密送、主题
3. 编辑正文（支持富文本：加粗、斜体、列表、链接）
4. 点击「发送邮件」

草稿会自动保存。

### 3.5 账户管理

点击顶部「账户」进入管理页面：

- 查看所有已绑定账户的状态、提供商、上次同步时间
- 添加新账户
- 移除已有账户

## 4. API 接口

后端提供 RESTful API，基础路径：`http://localhost:3002/api/v1`

### 认证

```
POST /api/v1/auth/login
Body: { "username": "admin", "password": "..." }
返回: { "token": "JWT..." }
```

后续请求 Header 带上：`Authorization: Bearer <token>`

### 主要接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /health | 健康检查 |
| GET | /accounts | 已绑定账户列表 |
| POST | /accounts/oauth/google/url | 获取 Gmail OAuth 授权链接 |
| POST | /accounts/oauth/microsoft/url | 获取 Microsoft OAuth 授权链接 |
| GET | /accounts/:id/messages | 获取指定账户邮件列表 |
| GET | /accounts/:id/messages/:msgId | 获取邮件详情 |
| POST | /accounts/:id/messages/send | 发送邮件 |
| GET | /mail | 统一收件箱（跨账户） |
| DELETE | /accounts/:id | 移除账户 |

### 发送邮件示例

```bash
curl -X POST http://localhost:3002/api/v1/accounts/<accountId>/messages/send \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "测试邮件",
    "to": [{"email": "test@example.com"}],
    "cc": [],
    "bcc": [],
    "html": "<p>这是一封测试邮件</p>",
    "text": "这是一封测试邮件"
  }'
```

## 5. 环境变量说明

配置文件位于 `mail-backend/.env`：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| PORT | 后端端口 | 3002 |
| DATABASE_URL | SQLite 数据库路径 | file:./prisma/dev.db |
| JWT_SECRET | JWT 签名密钥 | — |
| API_ADMIN_USERNAME | 管理员用户名 | admin |
| API_ADMIN_PASSWORD | 管理员密码 | — |
| GOOGLE_CLIENT_ID | Gmail OAuth 客户端 ID | — |
| GOOGLE_CLIENT_SECRET | Gmail OAuth 密钥 | — |
| GOOGLE_OAUTH_REDIRECT_URI | Gmail 回调地址 | http://localhost:3002/api/v1/accounts/oauth/google/callback |
| MICROSOFT_CLIENT_ID | Microsoft OAuth 客户端 ID | — |
| MICROSOFT_CLIENT_SECRET | Microsoft OAuth 密钥 | — |

## 6. 技术栈

- **前端**：React 18 + TypeScript + Ant Design + Zustand + Vite
- **后端**：Fastify + Prisma + SQLite + googleapis + zod
- **认证**：JWT + OAuth 2.0（Gmail / Microsoft Graph）

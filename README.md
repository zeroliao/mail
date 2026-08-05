# MailOps 邮件控制台

MailOps 是一个本机运行的多邮箱管理应用，用于统一连接 Gmail、Outlook/Hotmail 和兼容 IMAP/SMTP 的邮箱，集中查看邮件、发送邮件、管理账号标签和连接状态。

## 当前运行链路

- `frontend/`：React 18、TypeScript、Ant Design、Zustand、Vite
- `mail-backend/`：Fastify、Prisma、SQLite、Gmail API、Microsoft Graph、IMAP/SMTP
- `start.ps1` / `stop.ps1`：Windows 本机启动和停止
- `docker-compose.yml`：容器化运行

`backend/`、根目录 `ChatGPT_team.py` 及其相关文件是历史工具，不属于 MailOps 运行链路。除非任务明确涉及历史工具，否则不要在这些文件中实现 MailOps 功能。

## 快速开始

要求 Node.js 22+、npm 和 Windows PowerShell。

1. 从 `.env.example` 创建根目录 `.env`，填写管理员凭据、加密密钥及需要启用的 OAuth 配置。
2. 安装依赖：

   ```powershell
   npm --prefix mail-backend ci
   npm --prefix frontend ci
   ```

3. 启动应用：

   ```powershell
   npm start
   ```

4. 打开 `http://localhost:5173`。API 位于 `http://localhost:3000/api/v1`，Swagger 位于 `http://localhost:3000/docs`。
5. 停止应用：

   ```powershell
   npm stop
   ```

也可以使用桌面的 MailOps 快捷方式启动，或在登录后的页面右上角选择“停止服务”。

## 核心功能

- 管理员 JWT 登录
- Gmail / Microsoft OAuth 授权
- Microsoft `refresh_token + client_id` 单条或批量导入
- IMAP/SMTP 密码直连
- 统一收件箱、按账号和文件夹查看、搜索与快捷筛选
- 邮件详情、验证码识别与复制、撰写、回复、转发
- 账号标签新增、复用、编辑与筛选
- 本机一键启动和安全停止服务

## 开发入口

新会话或新贡献者按以下顺序阅读：

1. `AGENTS.md`：项目边界、命令、约束和验证要求
2. `docs/current-state.md`：当前实现、近期改动、已知风险和继续开发检查清单
3. `docs/usage-guide.md`：用户流程和主要接口
4. `docs/testing.md`：自动化覆盖与人工验收
5. `mail-backend/docs/architecture.md`：后端架构和数据边界

完整文档索引见 `docs/README.md`。部署和环境要求见 `DEPLOYMENT.md`，贡献约定见 `CONTRIBUTING.md`。

## 验证

```powershell
npm run validate
```

该命令依次运行后端 typecheck、前端 lint、前后端 tests 和 production build。涉及真实 OAuth、邮件发送、本机启动/停止或 UI 的改动，还需按 `docs/testing.md` 完成人工验收。

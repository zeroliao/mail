# 当前开发状态

更新时间：2026-08-05

本文是新会话的动态交接入口。稳定规则以 `../AGENTS.md` 为准，用户行为以 `usage-guide.md` 为准，测试要求以 `testing.md` 为准。

## 活动应用

MailOps 的活动运行链路是 `frontend/ + mail-backend/`：

- 前端使用 React 18、TypeScript strict、Ant Design、Zustand 和 Vite。
- 后端使用 Fastify、Prisma 和 SQLite，provider 位于 `mail-backend/src/providers/`。
- 根脚本负责 Windows 本机生命周期，Docker Compose 负责容器运行。
- `backend/` 和 `ChatGPT_team.py` 是历史实现，不应作为新增 MailOps 功能的入口。

## 已实现能力

- 管理员 JWT 登录和受保护 API。
- Gmail、Microsoft OAuth 授权，以及 Gmail/Microsoft/IMAP 邮件读写。
- Microsoft public client 的 `refresh_token + client_id` 单条和最多 100 条批量导入；导入前会向 Microsoft 换取 access token 并读取 `/me` 验证连通性。
- 账号以 `(provider, email)` 唯一，重复导入执行 upsert，恢复已归档账号并保留已有标签。
- 账号标签存于 `Account.metadata.labels`；收件箱和账户管理均可新增、复用、编辑和筛选标签。
- 统一收件箱、账号/文件夹切换、搜索、未读/星标/附件筛选、邮件详情、验证码识别、撰写/回复/转发。
- 后端 `ACTIVE` 映射为前端“账号可用”；其他状态映射为“需要处理”。access token 到期本身不代表异常，provider 调用前会尝试刷新。
- 登录后可调用本机限定的 `POST /api/v1/system/shutdown`；后端通过 `launch-stop.ps1` 脱离进程树后执行 `stop.ps1`。
- `stop.ps1` 使用 PID 与启动时间校验，并只清理命令行可确认属于本项目的 `3000/5173` 监听进程。

## 当前工作区上下文

工作区包含一组尚未提交的功能和 UI 改动，主要覆盖：

- Microsoft Token 单条/批量导入、token 刷新和错误处理。
- 账号标签、状态映射、收件箱筛选和验证码识别。
- 页面布局、响应式交互、富文本编辑与停止服务入口。
- Windows 启停脚本、Docker/CI、环境模板和相关测试。

这些改动及本机 SQLite 数据都应视为用户当前工作，不得因 Git 历史较旧而回滚。开始新任务前必须先运行 `git status --short` 和 `git diff --stat`，再阅读待改文件的现有 diff。

## 最近验证基线

2026-08-05 在当前工作区运行 `npm run validate` 已通过：

- 后端 typecheck 和前端 lint 通过。
- 后端 17/17 tests 通过。
- 前端 7/7 tests 通过，共 4 个 test files。
- 前后端 production build 通过。

上一轮还真实验证过页面停止、端口关闭、桌面快捷方式重启和启动窗口退出。任何新功能完成后仍需重新运行与改动范围匹配的检查；本基线不能替代后续验证。

## 已知边界与风险

- 当前管理员模型是单用户，JWT 保存在浏览器 `localStorage`；共享或公网部署必须使用 HTTPS 和严格 CSP。
- SQLite 面向单实例内部使用，多实例部署需要显式数据库迁移。
- OAuth、refresh token 和发信依赖外部 provider，自动化测试使用 mock，不能替代真实账号冒烟。
- Microsoft Token 批量导入是逐条串行处理，单条失败不影响后续；结果必须查看逐条明细。
- UI 批量粘贴目前接受 JSON Lines，或以逗号、Tab、`|` 分隔的 `email, refreshToken, clientId, displayName, scope`。外部表格若为其他列序或 `----` 分隔，需先转换，不能直接粘贴。
- 页面停止服务只支持通过 Windows 本机启动器运行的场景；容器和远程部署应使用各自的进程管理方式。
- 当前 frontend production build 的主 JS bundle 约 1.25 MB，Vite 会给出超过 500 kB 的警告；不阻塞本机使用，但后续页面继续增长时应考虑 route/component code splitting。

## 新会话继续开发

1. 阅读 `AGENTS.md` 和本文，确认任务属于活动应用。
2. 运行 `git status --short`、`git diff --stat`，检查未提交改动和敏感运行文件。
3. 根据任务读取直接相关的页面、service、route、provider 和测试，不根据旧 Git commit 推断当前行为。
4. 修改 API shape 时同步检查前端 service/types 和后端 route/service；修改 UI 时验证 desktop 与 390px mobile。
5. 更新受影响的权威文档，运行 targeted checks；跨模块或关键流程改动运行 `npm run validate`。
6. 最终说明实际验证、未验证的真实外部流程和剩余风险，不自动 commit 或 push。

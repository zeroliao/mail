# Project Instructions

## Scope And Runtime

- 本文件适用于整个 repository。
- 活动应用由 `frontend/` 和 `mail-backend/` 组成；`docker-compose.yml`、`start.ps1` 和 CI 均以这两个目录为准。
- `backend/` 是旧版 Express/PostgreSQL 实现，不属于当前运行链路；除非任务明确要求，不要在其中实现 MailOps 功能。
- 根目录的 `ChatGPT_team.py` 属于历史工具，不是 MailOps 的启动或架构依据。
- 开发与 CI 使用 Node.js 22、npm；本机一键启动脚本面向 Windows PowerShell。

## Commands

| Task              | Command                                                                           |
| ----------------- | --------------------------------------------------------------------------------- |
| Install           | `npm --prefix mail-backend ci`，然后 `npm --prefix frontend ci`                   |
| Start dev         | `npm start` 或 `./start.ps1 -Mode dev`                                            |
| Stop dev          | `npm stop` 或 `./stop.ps1`                                                        |
| Full validation   | `npm run validate`                                                                |
| Backend typecheck | `npm --prefix mail-backend run typecheck`                                         |
| Backend tests     | `npm --prefix mail-backend test`                                                  |
| Frontend lint     | `npm --prefix frontend run lint`                                                  |
| Frontend tests    | `npm --prefix frontend test`                                                      |
| Production build  | `npm run build`                                                                   |
| Docker dev        | `docker compose up --build -d`                                                    |
| Production config | `docker compose --env-file deploy/images.env -f deploy/docker-compose.yml config` |

- 默认端点：前端 `http://localhost:5173`，API `http://localhost:3000/api/v1`，Swagger `http://localhost:3000/docs`。
- 小范围修改先运行对应 component 的 targeted checks；共享 API、认证、数据模型或用户流程变更运行 `npm run validate`。

## Project Layout

- `frontend/src/pages/`: React route pages。
- `frontend/src/components/`: shared Ant Design UI components。
- `frontend/src/services/`: Axios API client and backend/frontend mapping。
- `frontend/src/store/`: Zustand application state。
- `frontend/src/types/`: frontend contracts；API shape 变更时同步检查。
- `mail-backend/src/modules/`: Fastify auth、account、mail、system routes and services。
- `mail-backend/src/providers/`: Gmail、Microsoft Graph and IMAP integrations。
- `mail-backend/prisma/`: SQLite schema and migrations。
- `mail-backend/test/`: Node test runner integration/unit tests。
- `deploy/`: production Compose、digest inputs and deployment instructions。
- `docs/releases/`: numbered release records；流程以 `docs/version-management.md` 为准。
- `start.ps1`, `launch-stop.ps1`, `stop.ps1`: local lifecycle management；修改后用 PowerShell parser 和真实 start/stop flow 验证。

## Conventions And Safety

- 前端保持 React 18、TypeScript strict、Ant Design、Zustand 和现有 CSS token/响应式模式，不引入第二套 UI system。
- 前端 API 默认使用 canonical `/api/v1` contract；修改 route、payload 或 response 时同步更新 `frontend/src/services/`、types 和相关 tests。
- 后端保持 Fastify module/service/provider 分层；provider-specific mail logic 放在 `mail-backend/src/providers/`。
- 受保护 API 必须保留 JWT authentication；OAuth callback、health 或本机 shutdown 等例外要显式审查安全边界。
- Mail tokens 和 per-account client credentials 必须加密存储，不得写入日志、测试快照、文档或提交信息。
- `.env`、`mail-backend/.env` 和 SQLite `*.db` 是本机敏感/运行数据；不要输出内容、直接编辑或纳入普通代码变更。
- 日常版本改动只进入 `dev/<version>`；候选内容从同一提交链进入 `release/<version>`，生产成功后才能进入 `main` 和 `v<version>`。
- 生产镜像只从 `release/<version>` 构建；本地和服务器必须使用版本记录中的 backend/frontend immutable digest，不使用 mutable tag。
- 生产部署前必须备份 SQLite；普通镜像回滚不得自动覆盖数据库。
- 修改 `mail-backend/prisma/schema.prisma` 时创建并验证 migration；不要用手改数据库替代 schema migration。
- 不要编辑 `node_modules/`、`dist/`、`.runtime/`、Prisma generated client 或 Playwright 临时产物。
- UI/交互变更需验证核心流程，并检查至少 desktop 和 390px mobile viewport 的溢出、重叠、loading、error 和 confirmation states。
- 工作区可能包含用户未提交的数据与代码变更；仅修改任务相关文件，不回滚或覆盖既有改动。

## References

| Need                                                     | Source                              |
| -------------------------------------------------------- | ----------------------------------- |
| Current implementation, worktree context and known risks | `docs/current-state.md`             |
| Setup, deployment, environment and release constraints   | `DEPLOYMENT.md`                     |
| User flows and API overview                              | `docs/usage-guide.md`               |
| Automated coverage and manual acceptance                 | `docs/testing.md`                   |
| Backend architecture and provider boundaries             | `mail-backend/docs/architecture.md` |
| Branch and commit conventions                            | `CONTRIBUTING.md`                   |
| CI gate                                                  | `.github/workflows/ci.yml`          |
| Version, image and release gates                         | `docs/version-management.md`        |
| Production Compose and short-downtime deploy             | `deploy/README.md`                  |

## Documentation Maintenance

- `AGENTS.md` 只记录长期有效的项目规则，不记录一次性进度、账号数量或本机故障。
- 完成功能或改变关键行为时，同步更新 `docs/current-state.md`；改变用户流程、API、部署或测试边界时更新对应权威文档。
- 不新建按日期堆叠的 handover、verification report 或重复测试计划；将仍有效的信息合并到现有权威文档。
- 文档中的命令、端口、路径和状态语义必须以当前代码、脚本和 CI 为准，不复制 secrets 或本机账号数据。

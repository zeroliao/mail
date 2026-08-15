# 当前开发状态

更新时间：2026-08-16

本文是新会话的动态交接入口。稳定规则以 `../AGENTS.md` 为准，用户行为以 `usage-guide.md` 为准，测试要求以 `testing.md` 为准。

## 活动应用

MailOps 的活动运行链路是 `frontend/ + mail-backend/`：

- 前端使用 React 18、TypeScript strict、Ant Design、Zustand 和 Vite。
- 后端使用 Fastify、Prisma 和 SQLite，provider 位于 `mail-backend/src/providers/`。
- 根脚本负责 Windows 本机生命周期，Docker Compose 负责容器运行。
- 正式版本使用 `dev/<version>`、`release/<version>`、`main` 和 `v<version>`；生产候选由两个 GHCR immutable digest 组成。
- `backend/` 和 `ChatGPT_team.py` 是历史实现，不应作为新增 MailOps 功能的入口。

## 已实现能力

- 管理员 JWT 登录和受保护 API。
- Gmail、Microsoft OAuth 授权，以及 Gmail/Microsoft/IMAP 邮件读写。
- Microsoft public client 的 `refresh_token + client_id` 单条和批量导入；前端支持 JSON 数组并按 100 条自动分批提交，新账号会向 Microsoft 换取 access token 并读取 `/me` 验证连通性。批量完成后可一键下载失败记录 JSON 并再次导入。
- 账号以 `(provider, email)` 唯一。再次添加已绑定账号会跳过且不改写凭据；已归档账号可重新导入并保留已有标签。
- 服务绑定存于 `Account.metadata.labels` 和 `Account.metadata.serviceNotes`；收件箱和服务管理页按服务查看可用邮箱，并可记录服务账号备注。
- 服务管理页支持面向注册场景的“找未使用邮箱”：输入服务名称后仅列出连接正常、尚未绑定且没有收码异常标记的邮箱；支持复制邮箱地址、标记注册完成，以及把长期收不到验证码的邮箱单独标记和恢复。
- 验证码收件台以服务目录为主入口，支持服务/邮箱范围切换、文本搜索、未读/验证码/星标筛选、邮件详情和验证码复制；撰写/回复/转发保留为低频能力。
- 后端 `ACTIVE` 映射为前端“账号可用”；其他状态映射为“需要处理”。access token 到期本身不代表异常，provider 调用前会尝试刷新。
- 登录后可调用本机限定的 `POST /api/v1/system/shutdown`；后端通过 `launch-stop.ps1` 脱离进程树后执行 `stop.ps1`。
- `stop.ps1` 使用 PID 与启动时间校验，并只清理命令行可确认属于本项目的 `3000/5173` 监听进程。

## 当前工作区上下文

版本 `001` 已成功部署到 `https://mail.zero007.chat`，生产归档为 `v001`，最终记录 commit 为 `4d041672678bf2fc3edb6ae0e146481b39f5f147`；实际镜像、备份和回滚信息以 `releases/001.md` 为准。

当前开发分支是从生产 `main` 创建的 `dev/002`。本版本用于加固发布与部署门禁：本地和 CI 共用 runtime gate、CI 仅在 runtime 输入变化时启动 backend production image、统一 exact-digest 隔离验证、补全首次 SQLite 导入和反向代理流程。GitHub default branch 已从历史 `develop` 调整为 `main`；`develop` 不再作为新版本起点。

工作区中的 SQLite 运行数据和浏览器临时产物不属于版本内容，不应提交。

开始新任务前必须先运行 `git status --short` 和 `git diff --stat`，再阅读待改文件的现有 diff；不得因 Git 历史较旧而回滚用户改动。

## 最近验证基线

版本 `001` 在 2026-08-15 完成以下验证并成功进入生产：

- 后端 typecheck 和前端 lint 通过。
- 后端 19/19 tests 通过。
- 前端 11/11 tests 通过，共 4 个 test files。
- 前后端 production build 通过。
- GitHub Actions YAML 结构解析通过；生产 Compose `config --quiet` 通过。
- 目标服务器 exact-digest 隔离验证、生产 health、管理员登录、数据聚合校验和 SQLite `integrity_check` 通过。
- backend/frontend 实际内存约为 130 MiB/5 MiB，部署后服务器 available memory 约 1.5 GiB。

上一轮还真实验证过页面停止、端口关闭、桌面快捷方式重启和启动窗口退出。任何新功能完成后仍需重新运行与改动范围匹配的检查；本基线不能替代后续验证。

2026-08-16 在 `dev/002` 对发布门禁改动完成本地检查：backend typecheck、frontend lint、backend 19/19 tests、frontend 11/11 tests、双端 production build、smoke shell syntax 和 local/production Compose config 均通过。Vite 仍报告约 1.26 MB 主 bundle warning。本机 Docker daemon 未运行；GitHub CI run `31896969466` 已在 Linux runner 成功完成 Docker build 和 backend production image runtime smoke，Prisma generate 无 OpenSSL detection warning。后续 runtime 输入变更统一运行 `deploy/scripts/validate-runtime-gate.sh`，首次 push 前必须在 Docker-capable 环境完成；纯文档提交复用最近成功 gate，CI 不重复构建镜像。

## 已知边界与风险

- 当前管理员模型是单用户，JWT 保存在浏览器 `localStorage`；共享或公网部署必须使用 HTTPS 和严格 CSP。
- SQLite 面向单实例内部使用，多实例部署需要显式数据库迁移。
- 生产部署使用 SQLite 备份后的短暂停机升级；当前架构不使用共享 SQLite 的双 backend 蓝绿发布。
- 生产 Compose 默认限制 frontend 为 128 MiB、backend 为 768 MiB；服务器不执行候选镜像构建。
- OAuth、refresh token 和发信依赖外部 provider，自动化测试使用 mock，不能替代真实账号冒烟。
- 当前生产 Gmail OAuth 已配置，Microsoft global OAuth 未配置；迁移的 per-account Microsoft 数据仍保留，但新增全局 Microsoft OAuth 授权依赖后续生产配置。
- Microsoft Token 批量导入是逐条串行处理，单条失败不影响后续；前端按每批 100 条提交，结果保留逐条明细，并可下载失败记录 JSON。
- UI 批量粘贴接受 JSON 数组、JSON Lines，或以逗号、Tab、`|` 分隔的 `email, refreshToken, clientId, displayName, scope`；单次最多 1000 条。外部表格若为其他列序或 `----` 分隔，需先转换，不能直接粘贴。
- 页面停止服务只支持通过 Windows 本机启动器运行的场景；容器和远程部署应使用各自的进程管理方式。
- 当前 frontend production build 的主 JS bundle 约 1.25 MB，Vite 会给出超过 500 kB 的警告；不阻塞本机使用，但后续页面继续增长时应考虑 route/component code splitting。
- Microsoft OAuth/Graph 网络不可达时后端返回 502，收件箱结束 loading、保留已有邮件并提供重试提示；单账号切换会先完成当前列表，再读取文件夹计数，避免并发触发多次 token 刷新。

## 新会话继续开发

1. 阅读 `AGENTS.md` 和本文，确认任务属于活动应用。
2. 运行 `git status --short`、`git diff --stat`，检查版本分支、未提交改动和敏感运行文件。
3. 根据任务读取直接相关的页面、service、route、provider 和测试，不根据旧 Git commit 推断当前行为。
4. 修改 API shape 时同步检查前端 service/types 和后端 route/service；修改 UI 时验证 desktop 与 390px mobile。
5. 更新受影响的权威文档，运行 targeted checks；跨模块或关键流程改动运行 `npm run validate`。
6. 涉及发版时按 `version-management.md` 的节点信号更新 `releases/<version>.md`；最终说明实际验证、未验证的真实外部流程和剩余风险，不自动 commit、push、tag 或部署。

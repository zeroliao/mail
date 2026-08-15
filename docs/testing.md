# 测试与验收

## 自动化门禁

从 repository 根目录运行：

```powershell
npm run validate
```

该命令覆盖：

- 后端 TypeScript typecheck
- 前端 ESLint
- 后端 Node test runner tests
- 前端 Vitest tests
- 前后端 production build

CI 在 Node.js 22 上对 `dev/*`、`release/*`、`main` 和 pull request 执行相同的 component checks。`frontend/`、`mail-backend/`、根 Compose、CI workflow 或 runtime gate 脚本变化时，CI 还会调用 `deploy/scripts/validate-runtime-gate.sh` 构建本地 Docker images，并真实执行 Prisma migration、health 检查和 Prisma/OpenSSL runtime 日志扫描；纯文档提交明确跳过该 Docker gate。修改单一组件时可以先运行对应命令，提交或交接跨模块改动前运行完整门禁。

修改 Docker、Compose 或 CI runtime 输入时，首次 push 前必须在 Docker-capable 环境运行：

```bash
bash deploy/scripts/validate-runtime-gate.sh
```

本机 Docker 不可用时，使用一次性隔离 Docker 环境或目标服务器隔离环境完成同一 gate。不要依赖 GitHub CI 逐次试错；push 后只跟踪当前 HEAD 的一个 run，失败时只读取对应失败 step 的日志。外部状态未变化时不重复验证，纯文档后续提交复用最近成功的 runtime gate。

## 当前自动化覆盖

后端测试重点覆盖：

- Microsoft public client refresh token 交换和 per-account `clientId` 刷新
- Microsoft 认证失败的最小化错误与 401 单次刷新重试
- Microsoft folder 到 Graph endpoint 的映射
- Token 单条/批量绑定、认证保护、重复账号跳过和服务绑定/备注更新
- 本机 shutdown 的 JWT 与来源限制
- Swagger 暴露 Token 绑定路由

前端测试重点覆盖：

- 邮件纯文本内容渲染
- Zustand 邮件状态与账号状态映射
- 服务名称规范化、复用、目录统计、筛选逻辑、未绑定服务邮箱识别和服务收码异常识别
- 验证码提取逻辑

测试文件是覆盖事实的最终来源；新增行为时优先在稳定 public interface 上增加回归测试，并同步更新本节的覆盖类别。

## 必须人工验证的流程

以下流程涉及真实 provider、操作系统或视觉布局，不能仅依赖 mock tests：

| 变更范围              | 最小人工验收                                                                                                                                                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OAuth / provider 配置 | 使用对应真实测试账号完成授权回调，确认账号出现且可拉取邮件                                                                                                                                                            |
| Microsoft Token 导入  | 分别验证单条成功、错误 token、重复账号 upsert、批量部分失败与逐条明细                                                                                                                                                 |
| 邮件读写              | 验证收件箱、详情、文件夹、分页、回复/转发和真实发送                                                                                                                                                                   |
| 服务绑定              | 在收件台与服务管理页新增/复用服务、填写账号备注，刷新页面后确认持久化和筛选一致；在服务管理页输入一个服务名称，确认“可注册新号”排除已绑定和“收不到验证码”的邮箱，并验证邮箱复制、异常标记、恢复候选和“标记已注册”反馈 |
| 状态                  | 验证 `ACTIVE` 显示“账号可用”，真实刷新失败时错误可见且不会误删账号                                                                                                                                                    |
| 网络 / VPN            | 断开 Microsoft 网络后确认 API 返回 502、页面停止骨架屏并显示网络/VPN 提示；恢复网络后点击重试                                                                                                                         |
| 启停脚本              | 执行 `start.ps1 -Mode dev -SkipOpen`，检查 health 与前端，再执行 `stop.ps1` 并确认 3000/5173 已关闭                                                                                                                   |
| 页面停止              | 登录后确认停止弹窗、取消、确认和失败状态；确认命令返回后进程实际退出                                                                                                                                                  |
| UI / interaction      | 检查 desktop 与 390px mobile 的 loading、empty、error、confirmation，以及文字溢出和控件重叠                                                                                                                           |

真实验证不得使用或记录生产邮箱凭据。OAuth 回调 URI 必须与当前 `.env` 和 provider 控制台完全一致，不要为临时端口新增长期文档。

## 发布候选验证

`release/<version>` 的候选验证除 `npm run validate` 外，还必须覆盖：

- `GHCR Images` workflow 从同一个 release source commit 生成 backend/frontend digest。
- 同一 release commit 的 `CI` workflow 通过 backend production image runtime smoke。
- `deploy/images.env` 使用两个非占位的 `@sha256:` 引用。
- `docker compose --env-file deploy/images.env -f deploy/docker-compose.yml config` 通过。
- 在目标服务器隔离环境或本地 Docker 中拉取 exact digest，backend `/api/v1/health` 和 frontend `/nginx-health` 通过；两种位置至少完成一种，优先使用目标服务器隔离环境。
- backend 启动 migration 完成，最近日志无 fatal、Prisma 或配置错误。
- source commit、compose commit、两个 digest 和验证结果已写入 `releases/<version>.md`。

exact-digest 隔离验证通过后才能把版本状态改为“已提测”。生产部署前还必须记录服务器资源检查、SQLite 备份和回滚目标；完整节点顺序以 `version-management.md` 为准。

## 发布记录原则

不要新增一次性的 `verification_report` 或按功能复制完整测试计划。开发阶段失败尝试不逐轮扩写版本记录；在门禁稳定后汇总根因、最终修复和最终 workflow run。最终回复记录本次实际执行结果；仍具有长期价值的覆盖边界更新到本文，动态实现风险更新到 `current-state.md`。

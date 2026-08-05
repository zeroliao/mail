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

CI 在 Node.js 22 上执行相同的 component checks，并额外构建 Docker images。修改单一组件时可以先运行对应命令，提交或交接跨模块改动前运行完整门禁。

## 当前自动化覆盖

后端测试重点覆盖：

- Microsoft public client refresh token 交换和 per-account `clientId` 刷新
- Microsoft 认证失败的最小化错误与 401 单次刷新重试
- Microsoft folder 到 Graph endpoint 的映射
- Token 单条/批量绑定、认证保护、账号 upsert 和标签更新
- 本机 shutdown 的 JWT 与来源限制
- Swagger 暴露 Token 绑定路由

前端测试重点覆盖：

- 邮件纯文本内容渲染
- Zustand 邮件状态与账号状态映射
- 标签规范化、复用和筛选逻辑
- 验证码提取逻辑

测试文件是覆盖事实的最终来源；新增行为时优先在稳定 public interface 上增加回归测试，并同步更新本节的覆盖类别。

## 必须人工验证的流程

以下流程涉及真实 provider、操作系统或视觉布局，不能仅依赖 mock tests：

| 变更范围              | 最小人工验收                                                                                        |
| --------------------- | --------------------------------------------------------------------------------------------------- |
| OAuth / provider 配置 | 使用对应真实测试账号完成授权回调，确认账号出现且可拉取邮件                                          |
| Microsoft Token 导入  | 分别验证单条成功、错误 token、重复账号 upsert、批量部分失败与逐条明细                               |
| 邮件读写              | 验证收件箱、详情、文件夹、分页、回复/转发和真实发送                                                 |
| 标签                  | 在收件箱与账户管理新增/复用标签，刷新页面后确认持久化和筛选一致                                     |
| 状态                  | 验证 `ACTIVE` 显示“账号可用”，真实刷新失败时错误可见且不会误删账号                                  |
| 启停脚本              | 执行 `start.ps1 -Mode dev -SkipOpen`，检查 health 与前端，再执行 `stop.ps1` 并确认 3000/5173 已关闭 |
| 页面停止              | 登录后确认停止弹窗、取消、确认和失败状态；确认命令返回后进程实际退出                                |
| UI / interaction      | 检查 desktop 与 390px mobile 的 loading、empty、error、confirmation，以及文字溢出和控件重叠         |

真实验证不得使用或记录生产邮箱凭据。OAuth 回调 URI 必须与当前 `.env` 和 provider 控制台完全一致，不要为临时端口新增长期文档。

## 发布记录原则

不要新增一次性的 `verification_report` 或按功能复制完整测试计划。最终回复记录本次实际执行结果；仍具有长期价值的覆盖边界更新到本文，动态实现风险更新到 `current-state.md`。

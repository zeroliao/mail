# 邮箱账号管理系统核心 E2E 测试用例

## 1. 目的

- 为任务 10 定义可执行的核心 E2E 测试用例。
- 按最新联调审计结论区分可立即准备的用例与依赖 OAuth 密钥的用例。

## 2. 适用范围

- 前端：
  - `frontend/src/pages/AuthBindingPage.tsx`
  - `frontend/src/pages/InboxPage.tsx`
  - `frontend/src/pages/ComposePage.tsx`
- 后端：
  - `POST /api/v1/auth/login`
  - `GET /api/v1/health`
  - `GET /api/v1/accounts`
  - `POST /api/v1/accounts/oauth/google/url`
  - `POST /api/v1/accounts/oauth/microsoft/url`
  - `GET /api/v1/accounts/:accountId/messages`
  - `GET /api/v1/accounts/:accountId/messages/:messageId`
  - `POST /api/v1/accounts/:accountId/messages/send`

## 3. 当前执行状态

根据最新联调审计结论：

- 前后端 API 契约已对齐
- 无结构性阻塞项
- 当前唯一外部阻塞是 OAuth secrets 未填入 `mail-backend/.env`

### 3.1 用例状态标签

- `ready-now`：无需 OAuth secrets，可立即设计或执行
- `pending-key`：依赖真实 OAuth secrets，当前只做用例准备，不执行
- `pending-console`：应用内 secrets 已到位，但仍依赖第三方控制台补充 OAuth 配置
- `design-only-mock`：当前先做 mock / stub 路径设计，待测试桩或测试环境到位后执行

### 3.2 当前可先推进范围

- 登录
- 健康检查状态展示
- 单账号消息列表
- Unified Inbox 列表
- 分页切换
- 消息详情
- Drawer 行为
- 筛选后保持选中
- 发送邮件表单校验
- 发送邮件 mock 路径设计

### 3.3 当前受阻范围

- Gmail OAuth 真链路
- Microsoft OAuth 真链路
- 基于真实 provider 的发送邮件端到端验证
- token 过期后的真实刷新链路验证

当前细分阻塞：

- Gmail：
  - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` 已写入 `mail-backend/.env`
  - 后端当前运行于 **port 3002**（port 3000 被 FastGPT Docker 容器占用）
  - 仍需在 Google Cloud Console 的 Authorized redirect URIs 中补登记：
    - `http://localhost:3002/api/v1/accounts/oauth/google/callback`
  - 此前已登记的 `http://localhost:3000/api/v1/accounts/oauth/google/callback` 已失效，保留不删但不依赖
  - 当前前端主链路使用：
    - `POST /api/v1/accounts/oauth/google/url`
    - `GET /api/v1/accounts/oauth/google/callback`
  - `/api/v1/auth/gmail/callback` 仅为兼容 alias，不是当前阻塞项
- Microsoft：
  - `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` 仍未提供

### 3.4 最新执行结果（2026-06-14）

- `POST /api/v1/auth/login` 实测通过，可正常获取 JWT
- `GET /api/v1/health` 实测通过，返回 `database.ok=true`、`oauthProviders.gmailConfigured=true`、`oauthProviders.microsoftConfigured=false`
- `GET /api/v1/accounts` 实测返回 0 条数据，当前尚无已绑定 Gmail 账号，因此消息列表 / 详情 / 发送全链路暂不可执行
- `POST /api/v1/accounts/oauth/google/url` 实测通过，返回 `authUrl` 与 `state`，且运行中后端实际发出的 `redirect_uri` 为 `http://localhost:3002/api/v1/accounts/oauth/google/callback`
- `GET /api/v1/accounts/oauth/google/callback?code=fake-code&state=invalid-state` 实测返回 `400`，非法 state 防护已验证通过
- 浏览器打开 Gmail OAuth 授权链接后，Google 页面直接返回 `错误 400：redirect_uri_mismatch`，说明 Google Cloud Console 当前尚未实际放行 `http://localhost:3002/api/v1/accounts/oauth/google/callback`
- 浏览器证据截图：`output/playwright/gmail-redirect-uri-mismatch.png`

## 4. 环境前置条件

### 4.1 基础环境

- 前端可通过浏览器访问
- 后端 `mail-backend` 已启动
- SQLite / Prisma 数据库可用
- 测试管理员账号可登录 `POST /api/v1/auth/login`

### 4.2 OAuth 测试账号

- Gmail 测试账号 1 个
- Microsoft/Outlook/Hotmail 测试账号 1 个
- 每个 provider 至少准备 1 个辅助收件账号，用于验证发信结果

### 4.3 测试数据要求

- 至少 1 个账号邮箱内有超过 8 封邮件，用于覆盖前端默认分页大小
- 至少 1 封包含 HTML 正文
- 至少 1 封包含附件

## 5. 核心 E2E 用例

## TC-E2E-000 登录成功/失败

### 状态

- `ready-now`

### 目标

- 验证后台登录、JWT 获取、失败提示和登录后基础数据拉取

### 优先级

- P0

### 测试步骤

1. 打开 `/auth`
2. 输入正确用户名和密码，点击 `Sign in`
3. 校验前端调用 `POST /api/v1/auth/login`
4. 登录成功后观察账号列表和页面状态
5. 再输入错误密码重复登录

### 预期结果

- 正确凭据返回 token
- token 被前端持久化并用于后续请求
- 页面进入已登录状态
- 登录后触发账号列表加载
- 错误凭据返回 401，并显示失败提示

## TC-E2E-000A 健康检查状态展示

### 状态

- `ready-now`

### 目标

- 验证 AppShell 对 health 结构的消费正常

### 优先级

- P0

### 测试步骤

1. 启动前后端
2. 访问任意主界面
3. 观察顶部 API 状态标签
4. 校验 `GET /api/v1/health` 返回结构

### 预期结果

- health 至少返回：
  - `status`
  - `database.ok`
  - `oauthProviders.gmailConfigured`
  - `oauthProviders.microsoftConfigured`
- AppShell 可正确展示状态，不报结构错误

## TC-E2E-001 OAuth 回调成功流程

### 状态

- Gmail: `pending-console`
- Microsoft: `pending-key`

### 目标

- 验证从前端发起 OAuth，到 provider 授权，再回调后端并回跳前端的主链路可用

### 优先级

- P0

### 覆盖 provider

- Gmail
- Outlook / Hotmail

### 前置条件

- 已配置对应 provider 的 `CLIENT_ID` / `CLIENT_SECRET`
- 前端、后端已启动
- 后端管理员账号可登录
- 待绑定的测试邮箱此前未解绑失败残留脏状态

Gmail 当前额外前提：

- Google Cloud Console 必须将 `http://localhost:3002/api/v1/accounts/oauth/google/callback` 加入 Authorized redirect URIs；本轮浏览器实测仍返回 `redirect_uri_mismatch`
- 不要求使用 `/api/v1/auth/gmail/callback` 作为主回调路径

### 测试步骤

1. 打开 `/auth`
2. 使用管理员账号登录
3. 在 `Bind Accounts` 页面点击 Gmail 或 Microsoft 的 `Bind account`
4. 校验前端先调用：
   - `POST /api/v1/accounts/oauth/google/url`
   - 或 `POST /api/v1/accounts/oauth/microsoft/url`
5. 校验接口返回 `authUrl` 和 `state`
6. 浏览器跳转到 provider 授权页
7. 使用测试邮箱完成授权确认
8. provider 回调到：
   - `/api/v1/accounts/oauth/google/callback?code=...&state=...`
   - 或 `/api/v1/accounts/oauth/microsoft/callback?code=...&state=...`
9. 校验后端完成 token 交换、账号落库，并跳回前端 `/auth?status=success`
10. 回到绑定页后，刷新账号列表

### 预期结果

- 页面成功回到前端，不停留在 provider 或后端 callback 页
- `GET /api/v1/accounts` 返回新绑定账号
- 新账号字段至少包含：
  - `provider`
  - `email`
  - `displayName`
- 前端 `Bound Accounts` 区域出现该账号
- 账号状态显示为可用状态，不是错误态

### 关键断言

- 数据库中新增或更新对应账号记录
- 不向前端暴露明文 access token / refresh token
- 相同 provider + email 重复绑定时不产生重复账号

## TC-E2E-001A OAuth 未配置 secrets 状态

### 状态

- `ready-now`

### 目标

- 验证未配置 provider secrets 时，前端和后端都能给出明确的不可用状态

### 优先级

- P0

### 测试步骤

1. 不配置 Google / Microsoft secrets 启动后端
2. 打开 `/auth`
3. 观察 Gmail / Microsoft 绑定卡片状态
4. 调用 `GET /api/v1/health`

### 预期结果

- 绑定卡片展示不可用或待配置状态
- health 返回能区分 `gmailConfigured` / `microsoftConfigured`
- 不应误导用户进入真实 OAuth 流程

### 当前适用说明

- 当前该用例主要适用于 Microsoft provider
- Gmail secrets 已写入环境，但仍需补充 Google Console redirect_uri 配置
- Gmail 一旦补完上述 redirect URI，即可直接转入真实端到端验证

## TC-E2E-002 OAuth state 非法/过期校验

### 状态

- Gmail: `pending-console`
- Microsoft: `pending-key`

### 目标

- 验证 OAuth callback 的安全分支，不允许非法 state 完成绑定

### 优先级

- P0

### 前置条件

- 系统已生成过一个合法 `state`

### 测试步骤

1. 发起一次合法 OAuth init，记录返回的 `state`
2. 手工构造 callback 请求，替换为错误 `state`
3. 再构造一次 callback，请求使用已过期或已消费的 `state`

### 预期结果

- 后端返回 400
- 不生成新的账号绑定
- 不修改已有账号状态

## TC-E2E-002A OAuth 授权失败回退

### 状态

- Gmail: `pending-console`
- Microsoft: `pending-key`

### 目标

- 验证用户取消授权或 provider 返回失败时，前端可见失败结果且不会产生脏绑定

### 优先级

- P0

### 测试步骤

1. 发起 Gmail 或 Microsoft OAuth
2. 在 provider 页面主动取消授权，或构造失败回调
3. 观察浏览器回跳结果与前端提示

### 预期结果

- 系统不会新增账号
- 前端应能看到失败提示或保持在可重试状态
- 不应出现假成功回跳

## TC-E2E-003 单账号邮件列表分页

### 状态

- `ready-now`

### 目标

- 验证单账号收件箱分页行为正确，第二页不是第一页重复数据
- 验证前端翻页时已正确传递 `nextPageToken` 与后端游标分页对齐

### 优先级

- P0

### 前置条件

- 至少 1 个已绑定账号
- 该账号收件箱邮件数 > 8

### 测试步骤

1. 打开 `/inbox`
2. 切换到单账号视图
3. 进入 `Inbox`
4. 记录第一页首尾消息 `providerMessageId`
5. 点击分页器进入第 2 页
6. 记录第二页首尾消息 `providerMessageId`

### 预期结果

- 页面成功切到第 2 页
- 第二页存在数据时，其消息集合不应与第一页完全重复
- 分页器页码与列表内容同步变化

### 回归验证备注

- 本项用于验证已修复的游标分页联调逻辑未回退
- 若第 2 页重复第一页数据，应登记为分页回归缺陷

## TC-E2E-003A 单账号详情打开与 Drawer 行为

### 状态

- `ready-now`

### 目标

- 验证消息详情在桌面与中等屏幕下的打开方式符合设计预期

### 优先级

- P1

### 测试步骤

1. 在桌面宽度下打开 `/inbox`
2. 点击一封邮件
3. 缩小到 Drawer 生效的宽度区间
4. 再点击另一封邮件

### 预期结果

- 桌面宽度下，详情在右侧固定面板展示
- 中等宽度下，详情通过 Drawer 展示
- 详情头部显示主题、账号标识、时间和主要操作

## TC-E2E-003B 筛选后保持选中

### 状态

- `ready-now`

### 目标

- 验证用户筛选列表后，如果当前选中邮件仍在结果集内，详情保持选中不丢失

### 优先级

- P1

### 测试步骤

1. 在单账号或 Unified Inbox 中选中一封邮件
2. 使用搜索或 quick filter 缩小结果集
3. 保证当前邮件仍在过滤后结果中

### 预期结果

- 当前选中邮件保持选中
- 详情面板不被无故清空
- 仅当当前邮件不在结果集时，才允许取消选中

## TC-E2E-003C 消息列表 mock/cached 路径

### 状态

- `design-only-mock`

### 目标

- 为不依赖真实 OAuth 的消息列表测试准备 mock/cached 路径方案

### 设计前提

- 使用测试数据库预置账号和邮件数据
- 列表接口优先走缓存或测试桩，不依赖实时 provider

### 设计步骤

1. 预置 1 个或 2 个测试账号
2. 预置多封邮件，覆盖未读、HTML、附件、不同时间排序
3. 前端登录后进入 `/inbox`
4. 验证列表、筛选、详情、分页等基础行为

### 预期结果

- 不依赖 OAuth secrets 也能提前验证 Inbox 主流程
- 便于先暴露前端列表状态管理与渲染问题

## TC-E2E-004 Unified Inbox 多账号分页

### 状态

- `ready-now`

### 目标

- 验证 unified inbox 在多账号场景下分页不串账号且可翻页
- 验证前端已改为直接调用 `GET /api/v1/mail?page=N&pageSize=N&folder=X`，由后端统一返回跨账号排序结果

### 优先级

- P1

### 前置条件

- 至少 2 个已绑定账号
- 两个账号总邮件数 > 8

### 测试步骤

1. 打开 `/inbox`
2. 保持 `Unified Inbox`
3. 确认前端请求命中 `GET /api/v1/mail`
4. 校验请求参数包含 `page`、`pageSize`、`folder`
5. 记录第一页中每条消息的 `accountId` 与消息 ID
6. 点击第 2 页
7. 再次记录第 2 页每条消息的 `accountId` 与消息 ID

### 预期结果

- 列表可以展示来自不同账号的消息
- 每条消息带 `accountId`
- 翻页后数据应发生变化，而不是重复第一页
- 点击消息详情时，能按正确 `accountId` 拉取详情
- 前端不再依赖并行多账号本地合并来生成 Unified Inbox 分页结果

### 回归验证备注

- 本项用于验证统一端点分页修复后，多账号视图没有引入新的串页或详情错绑问题
- 若翻页后数据仍停留在首批结果，应登记为 Unified Inbox 分页回归缺陷

## TC-E2E-005 发送邮件成功流程

### 状态

- Gmail: `pending-console`
- Microsoft: `pending-key`

### 目标

- 验证从前端 Compose 到后端发信、再到目标邮箱收到邮件的主链路可用

### 优先级

- P0

### 前置条件

- 至少 1 个已绑定且可发信账号
- 目标收件邮箱可登录验证

Gmail 当前额外前提：

- 必须先完成 Google OAuth 回调链路验证

### 测试步骤

1. 打开 `/compose`
2. 确认 `Sender account` 已选中目标发件账号
3. 填写 `To`
4. 填写 `Subject`
5. 填写正文，建议使用 HTML 内容
6. 点击 `Send mail`
7. 观察前端提示和页面跳转
8. 在收件邮箱验证邮件已收到

### 预期结果

- 前端调用 `POST /api/v1/accounts/:accountId/messages/send`
- 接口返回成功
- 页面提示发送成功
- 页面跳转行为与产品约定一致
- 收件箱收到邮件，主题、正文、发件账号正确

### 关键断言

- 发件账号必须与界面中选中的 sender 一致
- 返回失败时不应错误提示成功
- 邮件至少收到 1 次，不能重复发送

### 当前实现备注

- 当前 `frontend/src/pages/ComposePage.tsx` 在发送成功后执行 `navigate("/inbox")`
- UX 建议是“发送成功回 sent”，联调时需按最终产品口径验收

## TC-E2E-006 发送邮件表单校验

### 状态

- `ready-now`

### 目标

- 验证最基本的发送前校验与错误提示

### 优先级

- P0

### 测试步骤

1. 进入 `/compose`
2. 不填 `To`，直接发送
3. 不填 `Subject`，直接发送
4. 填写非法邮箱地址后发送

### 预期结果

- 缺少 `To` 或 `Subject` 时，前端阻止发送或后端返回明确错误
- 非法邮箱格式时返回可识别错误
- 不产生真实邮件

## TC-E2E-007 Token 过期后的发送邮件恢复

### 状态

- Gmail: `pending-console`
- Microsoft: `pending-key`

### 目标

- 验证 token 过期时，发信链路能自动刷新并继续发送

### 优先级

- P1

### 前置条件

- 测试账号存在 refresh token
- 可人为制造 access token 过期

### 测试步骤

1. 将已绑定账号 access token 调整为过期态
2. 从 `/compose` 发起发送
3. 观察后端是否执行 refresh

### 预期结果

- 后端自动刷新 token
- 发信成功
- 新 token 持久化
- 前端无感或仅提示短暂处理中

## TC-E2E-008 发送邮件 mock 路径设计

### 状态

- `design-only-mock`

### 目标

- 在真实 OAuth secrets 未就位前，先准备发送邮件的 mock/stub 验证方案

### 设计建议

1. 使用测试账号种子数据进入已绑定状态
2. 对发信 provider 调用做 stub，固定返回成功响应
3. 前端执行 `/compose` -> `Send mail`
4. 校验成功 toast、页面跳转和 sender account 显示
5. 再构造失败 stub，校验错误提示

### 预期结果

- 可提前验证 Compose 页的必填校验、发送态、成功态和失败态
- 不依赖真实第三方邮箱即可完成前端主路径测试

## 6. 执行顺序建议

1. 先执行 `TC-E2E-000`、`TC-E2E-000A`、`TC-E2E-003`、`TC-E2E-003A`、`TC-E2E-003B`、`TC-E2E-004`、`TC-E2E-006`
2. 并行准备 `TC-E2E-003C` 与 `TC-E2E-008` 的 mock/stub 路径
3. OAuth secrets 到位后，再执行 `TC-E2E-001`、`TC-E2E-002`、`TC-E2E-002A`、`TC-E2E-005`、`TC-E2E-007`

## 7. 阻塞项

- Gmail 相关 `TC-E2E-001/002A/005/007` 当前卡在 Google Cloud Console 未实际放行 `http://localhost:3002/api/v1/accounts/oauth/google/callback`；浏览器实测已出现 `错误 400：redirect_uri_mismatch`，旧 `3000` 条目已失效
- Gmail 相关 `TC-E2E-002` 已通过接口实测验证非法 state 返回 `400`
- Microsoft 相关 `TC-E2E-001/002/002A/005/007` 当前仍缺少 `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET`
- 发送邮件 mock 路径当前仅为测试设计，需后端或测试环境提供 stub 能力后执行

## 8. 建议后续动作

1. 按 `ready-now` 范围先完成非 OAuth 测试设计与缺陷清单
2. 若要提前验证发送邮件 UI 主路径，补一个 provider stub/mock 能力
3. OAuth secrets / Console 配置到位后，优先执行 Gmail 一轮真实冒烟，再执行 Microsoft 一轮
4. Gmail 冒烟前，先确认 Google Cloud Console 已实际放行 `http://localhost:3002/api/v1/accounts/oauth/google/callback`

# MailOps 使用说明

## 启动与登录

在 repository 根目录运行：

```powershell
npm start
```

启动后访问 `http://localhost:5173`。首次启动会从 `.env.example` 创建根 `.env`；使用前应检查其中的 `API_ADMIN_USERNAME`、`API_ADMIN_PASSWORD`、`JWT_SECRET` 和 `TOKEN_ENCRYPTION_KEY`，不要在文档或日志中记录真实值。

登录后才能使用账号、邮件和停止服务 API。JWT 保存在当前浏览器的 `localStorage`，退出登录会清除它。

## 添加邮箱账号

### Provider OAuth

在“连接”页面选择 Gmail 或 Outlook / Hotmail，跳转到 provider 完成授权。对应 callback URI 必须与根 `.env` 和 provider 控制台完全一致：

- Gmail：`http://localhost:3000/api/v1/accounts/oauth/google/callback`
- Microsoft：`http://localhost:3000/api/v1/accounts/oauth/microsoft/callback`

没有配置 provider client credentials 时，对应 OAuth 入口不可用。

### Microsoft Token 直连

适用于已有 Microsoft public client `refresh_token` 和 `client_id` 的账号。单条导入需要：

- `email`
- `refreshToken`
- `clientId`
- 可选 `displayName` 和自定义 `scope`

提交时后端先用 refresh token 换取 access token，再调用 Microsoft Graph `/me` 验证账号。验证成功后才保存为 `ACTIVE`；provider 返回的邮箱优先于输入邮箱。

批量导入支持最多 1000 条记录，前端会按接口上限每 100 条自动分批提交，支持：

- 一个 JSON 数组，如 `[{"email":"owner@outlook.com","refreshToken":"...","clientId":"..."}]`
- 每行一个 JSON object，如 `{"email":"owner@outlook.com","refreshToken":"...","clientId":"..."}`
- 每行按 `email, refreshToken, clientId, displayName, scope` 排列，分隔符可用逗号、Tab 或 `|`

批量任务逐条串行执行，单条失败不会中止后续账号。完成后查看成功、失败数量和逐条错误明细；存在失败记录时，可点击“下载失败数据 JSON”，下载的数组可直接再次粘贴导入。

外部数据若为 `邮箱----密码----client_id----refresh_token`，不能原样粘贴到当前 UI：需要转换为上述列序和分隔符。Token 直连不依赖邮箱密码；不要为了兼容表格格式在 UI 中保存无用密码。

### IMAP / SMTP 密码直连

输入邮箱和密码后，系统先验证 IMAP 连接，再按域名选择默认服务器并保存连接信息。也可以通过 API 提供自定义 IMAP/SMTP host 和 port。

### 重复账号

数据库以 `(provider, email)` 唯一标识账号。相同 provider 和邮箱再次导入不会创建重复记录，而是更新凭据、恢复已归档账号、设置为 `ACTIVE`，并保留原有标签。

## 账号状态

| 后端状态       | UI 含义  | 说明                                                              |
| -------------- | -------- | ----------------------------------------------------------------- |
| `ACTIVE`       | 账号可用 | 正常状态；access token 过期不等于异常，访问 provider 前会尝试刷新 |
| `DISCONNECTED` | 需要处理 | 连接已断开，需要重新绑定或更新凭据                                |
| `ERROR`        | 需要处理 | 账号被标记为错误，需要检查 provider 错误和凭据                    |
| `ARCHIVED`     | 不显示   | 软删除状态，普通账号列表不会返回；再次导入可恢复为 `ACTIVE`       |

当前自动流转是：OAuth/导入成功或重复导入成功到 `ACTIVE`，删除到 `ARCHIVED`，归档账号再次导入回到 `ACTIVE`。`DISCONNECTED` 和 `ERROR` 目前由账号更新接口设置，不要假设一次 provider 请求失败会自动持久化状态。

前端只将 `ACTIVE` 映射为“账号可用”，其他可见状态统一显示“需要处理”。判断账号是否正常应结合状态和一次真实收件测试，不应仅根据 access token 到期时间判断。

## 服务绑定与筛选

“服务与邮箱”页面用于维护验证码服务和邮箱的绑定关系：

- 每个账号最多 12 个服务名称，每个名称最多 24 个字符。
- 服务名称会自动 trim、去空和去重，已有服务可跨邮箱复用。
- 每个服务可记录一条账号备注，例如主账号、企业账号或登录名。
- 备注最多 160 个字符，删除服务绑定时会同步清理对应备注。
- 注册某个服务的新账号时，在“注册新账号”输入服务名称并点击“找未使用邮箱”，页面只显示连接正常且尚未绑定该服务的邮箱。
- 如果某个邮箱对服务长期收不到验证码，可在该服务视图标记“收不到验证码”；它会从“可注册新号”中排除，并进入独立的异常视图，之后可恢复候选资格。
- 邮箱列表支持一键复制邮箱地址；注册完成后可点击“标记已注册”，直接把当前服务绑定到该邮箱。
- 收件台先选择服务，再查看该服务可用的邮箱和验证码邮件；也可以进一步切换单个邮箱。
- 服务绑定仍存于账号 `metadata.labels`，备注存于 `metadata.serviceNotes`，收码异常存于 `metadata.serviceStatuses`；刷新页面和重复导入账号时都会保留。

旧账号标签会继续作为服务名称使用，无需迁移数据。

## 添加邮箱账号

- 通过 OAuth、Microsoft Token 单条/批量导入或 IMAP/SMTP 密码直连添加时，系统会先检查同一提供商下的邮箱账号。
- 已绑定的账号会返回“已跳过”，不会再次校验或覆盖已有凭据；批量导入会分别统计成功、跳过和失败数量。
- “已绑定账号”列表可在分页控件中选择每页显示 8、16、32 或 64 个账号。

## 收件箱与邮件

- 验证码收件台默认按服务目录工作；“全部服务”可合并显示所有已接入邮箱的邮件，也可以切换单个邮箱。
- 支持收件箱、已标星、已发送、草稿和归档文件夹。
- 支持文本搜索以及未读、验证码、已标星快捷筛选；搜索也会匹配服务名称和服务备注。
- 邮件详情支持 HTML 安全渲染、纯文本回退和验证码识别复制。
- 写邮件、回复和转发仍可用，但在主导航中降为低频入口。

真实收件、分页和发信依赖 provider 状态。发生错误时先查看页面错误明细和后端日志，但不得输出 token、密码或完整 provider 响应中的敏感字段。

## 停止服务

- 命令行：在根目录运行 `npm stop` 或 `./stop.ps1`。
- 页面：登录后点击右上角停止按钮并确认。

页面会调用受 JWT 保护的 `POST /api/v1/system/shutdown`。该接口只接受本机请求，并只适用于 Windows 本机启动器；Docker 或远程部署使用对应的进程管理命令。停止完成后，再次使用需重新运行启动脚本或桌面快捷方式。

## 主要 API

API base URL 是 `http://localhost:3000/api/v1`，完整交互文档位于 `http://localhost:3000/docs`。

| Method   | Path                                       | Purpose                      |
| -------- | ------------------------------------------ | ---------------------------- |
| `POST`   | `/auth/login`                              | 管理员登录                   |
| `GET`    | `/health`                                  | 健康检查                     |
| `GET`    | `/config/oauth-providers`                  | OAuth 可用性与 callback 配置 |
| `GET`    | `/accounts`                                | 账号列表                     |
| `POST`   | `/accounts/oauth/{provider}/url`           | 创建 OAuth URL               |
| `GET`    | `/accounts/oauth/{provider}/callback`      | OAuth callback               |
| `POST`   | `/accounts/bind-oauth`                     | Microsoft Token 单条导入     |
| `POST`   | `/accounts/bind-oauth/batch`               | Microsoft Token 批量导入     |
| `POST`   | `/accounts/bind-credentials`               | IMAP 密码直连                |
| `PUT`    | `/accounts/:accountId/labels`              | 更新服务绑定和服务账号备注   |
| `DELETE` | `/accounts/:accountId`                     | 软删除账号                   |
| `GET`    | `/accounts/:accountId/messages`            | 指定账号邮件列表             |
| `GET`    | `/accounts/:accountId/messages/:messageId` | 邮件详情                     |
| `POST`   | `/accounts/:accountId/messages/send`       | 指定账号发信                 |
| `GET`    | `/mail`                                    | 跨账号邮件列表               |
| `POST`   | `/mail/send`                               | 跨账号发信入口               |
| `POST`   | `/system/shutdown`                         | 本机停止服务                 |

除 health、OAuth callback 等显式公共端点外，业务 API 均要求 `Authorization: Bearer <token>`。

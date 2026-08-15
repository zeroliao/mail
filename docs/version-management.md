# 版本与发布管理

本文是 MailOps 的版本、分支、候选镜像和生产发布流程权威说明。

## 版本模型

MailOps 使用单仓库、全局递增的三位版本号：

```text
main
dev/<version>
release/<version>
v<version>
```

- `main`：只保存已经成功部署到生产的版本。
- `dev/<version>`：该版本唯一的日常开发分支。
- `release/<version>`：从对应 dev 分支同步的候选分支，不作为普通开发入口。
- `v<version>`：生产部署成功后的归档 tag。

GitHub default branch 必须为 `main`。历史 `develop` 只作为 `001` 的迁移起点，不再承载 workflow 注册、日常开发或新版本分配。

版本从 `001` 开始。创建版本前，应从本地和远程 `dev/*`、`release/*`、`v*` tag 及 `docs/releases/*.md` 计算最大已占用编号，新版本使用最大编号加一；历史编号不得复用。

版本状态只允许：

```text
开发中 / 已提测 / 成功 / 失败 / 取消
```

## 版本流程

1. 创建版本：
   - 分配下一个版本号并创建 `docs/releases/<version>.md`。
   - 从最新生产 `main` 创建 `dev/<version>`；首次迁移版本 `001` 以原 `develop` 的当前实现为起点。
2. 开发：
   - 功能、测试、migration、文档和部署配置均进入 `dev/<version>`。
   - 同一批改动只保留一条提交链，不在 dev、release 和 main 上分别重做提交。
   - 完成与改动范围匹配的检查；跨模块或发布流程变更运行 `npm run validate`。
   - Docker、Compose、CI runtime 输入变化时，首次 push 前必须在 Docker-capable 环境运行统一 gate。Windows 本机使用 `npm.cmd run validate:runtime`，该命令会限时探测并按需启动 Docker Desktop；Docker daemon 已就绪的 Linux/macOS 环境使用 `bash deploy/scripts/validate-runtime-gate.sh`。两者执行同一个 build/runtime smoke。当前机器无法提供 Docker 时，改用一次性隔离 Docker 环境，不把 GitHub CI 当作交互式调试器，也不在生产服务器覆盖本地 image tag。
3. 提测：
   - 将 `dev/<version>` fast-forward 到 `release/<version>`。
   - 推送 release 分支后，等待 `CI` 和 `GHCR Images` workflow 均成功；CI 必须真实启动 backend production image，并验证 migration、health 和 Prisma/OpenSSL runtime 日志。
   - 由 `GHCR Images` workflow 构建 backend/frontend 候选镜像。
   - 将 workflow 输出的两个 immutable digest 写入版本记录和 `deploy/images.env`。
   - 使用同一个 release source commit、compose commit 和两个 digest 完成一次 exact-digest 隔离验证。目标服务器隔离验证优先；目标服务器不可用时可以使用本地 Docker。两者是替代路径，不要求无状态变化时重复执行。
   - 验证通过后将状态改为 `已提测`。
4. 部署：
   - 生产部署前检查服务器资源、候选配置和回滚目标。
   - 备份 SQLite 数据库后执行短暂停机升级。
   - 验证 backend/frontend health、登录和本版本核心路径。
5. 成功：
   - 将状态改为 `成功`，记录生产结果、备份路径和实际 digest。
   - 将 `release/<version>` fast-forward 到 `main`。
   - 创建 `v<version>` tag；tag workflow 只归档 GitHub Release，不重新构建镜像。
   - 如需要版本镜像 tag，使用 `Promote Verified Images` 提升已经验证的 digest；该操作不改变生产输入，也不阻塞版本成功。
6. 失败或取消：
   - 记录失败原因并停止后续节点，不合入 `main`。
   - 失败部署回滚到版本记录中的上一成功 digest；涉及 schema/data 变化时按备份计划单独处理数据库。

若 fast-forward 失败，必须先检查分叉或重复补丁，不得通过重新提交同一内容来推进版本。

## 镜像规则

- backend：`ghcr.io/zeroliao/mail-backend`
- frontend：`ghcr.io/zeroliao/mail-frontend`
- 候选镜像只能由 `release/*` 构建。
- 候选进入隔离验证前，backend production image runtime smoke 必须通过；只完成 Docker build 不构成运行时验证。
- 候选 tag 使用 `release-<version>-<short_sha>` 和 `sha-<commit>`，仅用于定位。
- 本地验证和生产部署必须使用 `image@sha256:<digest>`。
- `main`、`latest`、release tag 或 Git tag 都不得代替经过验证的 digest。
- `v<version>` tag 不触发新的生产镜像构建。
- 只修改文档或部署配置时，可以复用版本记录中确认的既有 digest。

## 生产部署约束

- `docker-compose.yml` 用于本地构建；生产使用 `deploy/docker-compose.yml`。
- 生产服务器不执行 Vite/TypeScript 镜像构建，只拉取候选 digest。
- 生产保持单 backend 实例和单 SQLite writer，不采用蓝绿双实例。
- 升级前必须备份 `mail_data` 中的 SQLite 数据库。
- Prisma migration 在 backend 启动时执行；涉及破坏性或不可逆 migration 时，部署前必须单独确认恢复方案。
- `.env`、数据库和备份均留在服务器，不进入 Git、版本记录或日志。
- 迁移包含加密 token 的 SQLite 时，生产必须沿用源数据对应的 `TOKEN_ENCRYPTION_KEY`。不得输出或提交密钥；迁移前后只在受控终端核对非敏感指纹或完成真实解密验证。
- 生产 Compose 默认限制 frontend 为 128 MiB、backend 为 768 MiB；调整限制必须记录原因和服务器余量。

详细部署命令见 `../deploy/README.md`。

## 节点完成信号

| 节点           | 完成信号                                                                 |
| -------------- | ------------------------------------------------------------------------ |
| 创建版本       | 编号、初始 commit、目标和回滚基线已写入版本记录                          |
| 开发完成       | dev 工作区干净，commit 和验证结果已记录                                  |
| release 推送   | release 分支已推送且与 dev 保持同一提交链                                |
| 镜像构建       | workflow Summary 输出两个完整 immutable digest                           |
| 候选隔离验证   | 验证位置、source commit、compose commit、digest、health 和日志结果已记录 |
| 服务器候选检查 | 资源、端口、环境变量、digest 和回滚目标检查通过                          |
| 备份           | SQLite 备份路径、时间和文件校验结果已记录                                |
| 部署成功       | health、日志、登录及版本核心路径验证通过                                 |
| 归档           | main、`v<version>` 和成功版本记录指向同一已部署内容                      |

任一节点缺少完成信号时，不进入下一节点。

## 执行边界

- 已记录且外部状态未变化的节点不重复执行；只重新读取足以证明状态变化的最小信号。
- push 后只跟踪当前 HEAD 对应的一个 workflow run；失败后读取该 run 的失败 job/step 日志并针对根因修改，不并行追踪或反复查询多个 run。
- workflow、SSH 或权限操作失败时，先定位失败原因。相同命令最多重试一次；仍失败则记录阻塞，不通过替代写操作绕过权限边界。
- 数据迁移临时目录必须使用明确、受限的路径，并在成功或失败退出时清理。生产备份不属于临时目录，禁止随普通清理删除。
- `Promote Verified Images`、mutable image tag 和开发分支归档是可选后续动作，不得被误认为生产 health、数据完整性或版本归档的阻塞门禁。
- 版本记录在节点达到稳定结果后汇总根因、最终修复和最终 run；开发阶段失败尝试不逐轮追加完整发布记录。候选镜像 run、最终记录 CI run 和 Release Archive run 分开记录，避免混淆构件来源。
- 纯文档提交可以复用当前版本最近一次成功的 runtime gate；CI 对未修改 runtime 输入的提交明确跳过 Docker build/runtime smoke。

## 紧急修复

正常修复仍应创建下一个 `dev/<version>`。仅在生产故障且用户明确批准时，才能直接修改 `release/<version>`；部署成功后必须把原始提交回填到对应 dev 分支，不能手工重做等价补丁。

## 版本记录模板

每个 `docs/releases/<version>.md` 至少记录：

```text
版本：
状态：开发中 / 已提测 / 成功 / 失败 / 取消
类型：源码 / 部署 / 混合
初始 commit：
source commit：
compose commit：
backend image digest：
frontend image digest：
候选镜像 workflow：
最终记录 CI workflow：
Release Archive workflow：
exact-digest 隔离验证位置：本地 / 目标服务器
exact-digest 隔离验证：
服务器候选检查：
SQLite 备份：
生产部署结果：
回滚版本与 digest：
已知风险与未验证项：
备注：
```

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
3. 提测：
   - 将 `dev/<version>` fast-forward 到 `release/<version>`。
   - 推送 release 分支后，由 `GHCR Images` workflow 构建 backend/frontend 候选镜像。
   - 将 workflow 输出的两个 immutable digest 写入版本记录和 `deploy/images.env`。
   - 使用同一个 release source commit、compose commit 和两个 digest 完成本地 Docker 验证。
   - 验证通过后将状态改为 `已提测`。
4. 部署：
   - 生产部署前检查服务器资源、候选配置和回滚目标。
   - 备份 SQLite 数据库后执行短暂停机升级。
   - 验证 backend/frontend health、登录和本版本核心路径。
5. 成功：
   - 将状态改为 `成功`，记录生产结果、备份路径和实际 digest。
   - 将 `release/<version>` fast-forward 到 `main`。
   - 创建 `v<version>` tag；tag workflow 只归档 GitHub Release，不重新构建镜像。
   - 如需要版本镜像 tag，使用 `Promote Verified Images` 提升已经验证的 digest。
6. 失败或取消：
   - 记录失败原因并停止后续节点，不合入 `main`。
   - 失败部署回滚到版本记录中的上一成功 digest；涉及 schema/data 变化时按备份计划单独处理数据库。

若 fast-forward 失败，必须先检查分叉或重复补丁，不得通过重新提交同一内容来推进版本。

## 镜像规则

- backend：`ghcr.io/zeroliao/mail-backend`
- frontend：`ghcr.io/zeroliao/mail-frontend`
- 候选镜像只能由 `release/*` 构建。
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
- 生产 Compose 默认限制 frontend 为 128 MiB、backend 为 768 MiB；调整限制必须记录原因和服务器余量。

详细部署命令见 `../deploy/README.md`。

## 节点完成信号

| 节点           | 完成信号                                                       |
| -------------- | -------------------------------------------------------------- |
| 创建版本       | 编号、初始 commit、目标和回滚基线已写入版本记录                |
| 开发完成       | dev 工作区干净，commit 和验证结果已记录                        |
| release 推送   | release 分支已推送且与 dev 保持同一提交链                      |
| 镜像构建       | workflow Summary 输出两个完整 immutable digest                 |
| 本地验证       | source commit、compose commit、digest、health 和日志结果已记录 |
| 服务器候选检查 | 资源、端口、环境变量、digest 和回滚目标检查通过                |
| 备份           | SQLite 备份路径、时间和文件校验结果已记录                      |
| 部署成功       | health、日志、登录及版本核心路径验证通过                       |
| 归档           | main、`v<version>` 和成功版本记录指向同一已部署内容            |

任一节点缺少完成信号时，不进入下一节点。

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
本地 Docker 验证：
服务器候选检查：
SQLite 备份：
生产部署结果：
回滚版本与 digest：
备注：
```

# MailOps Production Deployment

生产发布的版本与门禁以 `../docs/version-management.md` 为准。本目录不保存服务器密钥、SQLite 数据库或备份。

## Candidate Inputs

候选部署必须同时确定：

- `release/<version>` source commit
- 包含实际 digest 的 compose commit
- `ghcr.io/zeroliao/mail-backend@sha256:<digest>`
- `ghcr.io/zeroliao/mail-frontend@sha256:<digest>`

`images.env` 中的全零 digest 只用于开发分支占位，不是可部署镜像。release 候选必须将其替换为 `GHCR Images` workflow Summary 输出的实际 digest。

## Server Layout

建议服务器 checkout 位于 `/opt/mailops-deploy`：

```text
/opt/mailops-deploy/.env
/opt/mailops-deploy/deploy/docker-compose.yml
/opt/mailops-deploy/deploy/images.env
/opt/mailops-deploy/backups/
```

`.env` 从 `.env.example` 创建并保留在服务器，不提交到 Git。OAuth redirect URI 和 `APP_BASE_URL` 必须使用最终 HTTPS 域名。

## Validate Candidate

在仓库根目录执行：

```bash
docker compose --env-file deploy/images.env -f deploy/docker-compose.yml config
docker compose --env-file deploy/images.env -f deploy/docker-compose.yml pull
```

继续前确认：

- 两个 image 均为非占位的 `@sha256:` 引用。
- `.env` 中所有生产必填项存在且不是示例值。
- `free -m` 的 available memory 不低于 1 GiB。
- `15173` 和 `13000` 端口未冲突，或已经显式选择其它本机端口。
- 当前版本记录包含 source commit、compose commit、两个 digest 和回滚目标。

## Backup

每次升级前为 SQLite 创建新的、带时间戳的备份目录。为避免复制到写入中的数据库，先优雅停止 backend，再复制已关闭的 SQLite 文件：

```bash
backup_dir="backups/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$backup_dir"
docker compose --env-file deploy/images.env -f deploy/docker-compose.yml stop backend
docker compose --env-file deploy/images.env -f deploy/docker-compose.yml cp backend:/data/dev.db "$backup_dir/dev.db"
sha256sum "$backup_dir/dev.db"
```

把备份路径和 checksum 结果写入版本记录。复制或校验失败时，使用原候选输入执行 `docker compose ... start backend` 恢复旧服务并停止部署。首次部署没有现有数据库时，应记录“首次部署，无数据库可备份”，不要伪造备份结果。

不要覆盖旧备份；恢复数据库属于单独的高风险操作，不包含在普通镜像回滚中。

## Deploy

备份完成后执行短暂停机升级：

```bash
docker compose --env-file deploy/images.env -f deploy/docker-compose.yml up -d --remove-orphans
docker compose --env-file deploy/images.env -f deploy/docker-compose.yml ps
docker compose --env-file deploy/images.env -f deploy/docker-compose.yml logs --tail 200 backend frontend
```

验证：

- backend `/api/v1/health` 返回成功。
- frontend `/nginx-health` 返回成功。
- HTTPS、登录和本版本核心路径正常。
- backend 日志没有 migration、Prisma、OAuth 配置或启动错误。

## Rollback

非数据库兼容性问题优先恢复上一成功版本记录中的两个 image digest，再重新执行 `up -d`。如果 migration 改变了 schema 或数据，先停止服务并根据该版本的恢复计划决定是否恢复 SQLite 备份；未经明确确认不要自动覆盖生产数据库。

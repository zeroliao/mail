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
set -a
. deploy/images.env
set +a
bash deploy/scripts/smoke-backend-image.sh "$MAILOPS_BACKEND_IMAGE"
```

继续前确认：

- 两个 image 均为非占位的 `@sha256:` 引用。
- `.env` 中所有生产必填项存在且不是示例值。
- `free -m` 的 available memory 不低于 1 GiB。
- `15173` 和 `13000` 端口未冲突，或已经显式选择其它本机端口。
- 当前版本记录包含 source commit、compose commit、两个 digest 和回滚目标。
- 同一 release commit 的 `CI` runtime smoke 和 `GHCR Images` workflow 均成功。

## Exact-Digest Isolation

候选状态改为“已提测”前，必须对版本记录中的两个 exact digest 完成一次隔离验证。优先在目标服务器执行，因为这能同时覆盖目标 CPU、Docker、OpenSSL 和主机资源；目标服务器不可用时使用本地 Docker。外部状态未变化时不要在两个位置重复同一验证。

目标服务器隔离验证应使用独立 Compose project、独立 volume 和非生产端口，例如：

```bash
MAILOPS_BACKEND_PORT=23000 MAILOPS_FRONTEND_PORT=25173 \
  docker compose -p mailops-candidate-002 \
  --env-file deploy/images.env -f deploy/docker-compose.yml up -d

curl --fail http://127.0.0.1:23000/api/v1/health
curl --fail http://127.0.0.1:25173/nginx-health
docker compose -p mailops-candidate-002 \
  --env-file deploy/images.env -f deploy/docker-compose.yml logs --tail 200
docker compose -p mailops-candidate-002 \
  --env-file deploy/images.env -f deploy/docker-compose.yml down -v
```

将 project 名和端口替换为当前版本的唯一值。验证记录至少包含运行位置、source commit、compose commit、容器实际 image reference、health、Prisma migration、OpenSSL/Prisma 日志和清理结果。隔离实例不得挂载生产 `mail_data`。

## Initial SQLite Import

本节只用于首次部署或明确批准的主机迁移，不用于普通版本升级。普通升级必须使用后文的 Backup 流程。

导入前必须确认：

- 本地 MailOps 已停止写入源数据库。
- 源数据库执行 `PRAGMA integrity_check` 返回 `ok`，并记录 SHA-256。
- 生产 `.env` 使用源数据对应的同一个 `TOKEN_ENCRYPTION_KEY`。只在受控终端核对非敏感指纹或执行真实解密验证，不输出密钥本身。
- 目标 `mail_data` 中不存在需要保留的数据库；如果已存在，停止并改走备份/恢复审批流程。

在目标服务器的单个 shell session 中使用受限临时目录，并确保任何退出路径都会清理：

```bash
import_dir="$(mktemp -d /tmp/mailops-import.XXXXXX)"
cleanup() {
  rm -rf -- "$import_dir"
}
trap cleanup EXIT

install -m 600 /secure-transfer/dev.db "$import_dir/dev.db"
sha256sum "$import_dir/dev.db"

backup_dir="backups/initial-import-$(date -u +%Y%m%dT%H%M%SZ)"
install -d -m 700 "$backup_dir"
install -m 600 "$import_dir/dev.db" "$backup_dir/dev.db"
sha256sum "$backup_dir/dev.db"

docker compose --env-file deploy/images.env -f deploy/docker-compose.yml \
  run --rm --no-deps backend sh -c 'test ! -e /data/dev.db'
docker compose --env-file deploy/images.env -f deploy/docker-compose.yml \
  create backend
docker compose --env-file deploy/images.env -f deploy/docker-compose.yml \
  cp "$import_dir/dev.db" backend:/data/dev.db
docker compose --env-file deploy/images.env -f deploy/docker-compose.yml \
  up -d --remove-orphans
```

`/secure-transfer/dev.db` 表示已经通过受控传输到服务器的源文件，不应长期保留。启动后验证 health、真实管理员登录、账号可见数、soft-delete 过滤和必要的聚合计数，不输出邮箱地址、token 或邮件内容。把 `backup_dir`、checksum 和校验结果写入版本记录；`trap` 只清理临时目录，不删除生产备份。

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

## Reverse Proxy And TLS

反向代理变更必须先备份配置、静态验证，再 reload。使用 Caddy 时：

```bash
backup_path="/etc/caddy/Caddyfile.pre-mailops-$(date -u +%Y%m%dT%H%M%SZ)"
sudo cp -a /etc/caddy/Caddyfile "$backup_path"
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

版本记录中保存备份路径，不保存证书、账户或环境变量。验证时区分：

- origin：使用目标 IP 和 Host/SNI 直接验证 Caddy、backend/frontend 转发和 origin TLS。
- public：通过最终域名验证 Cloudflare/CDN、HTTPS、登录和核心路径。

public 与 origin 的 HTTP redirect 状态码可能不同，例如 CDN 返回 `301` 而 origin 返回 `308`；分别记录，不把其中一个误写为另一个。

## Rollback

非数据库兼容性问题优先恢复上一成功版本记录中的两个 image digest，再重新执行 `up -d`。如果 migration 改变了 schema 或数据，先停止服务并根据该版本的恢复计划决定是否恢复 SQLite 备份；未经明确确认不要自动覆盖生产数据库。

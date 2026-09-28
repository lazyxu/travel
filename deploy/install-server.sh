#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

TRAVEL_HOME="${TRAVEL_HOME:-$HOME/.travel}"
CONFIG_DIR="$TRAVEL_HOME/config"
BIN_DIR="$TRAVEL_HOME/bin"
DATA_DIR="$TRAVEL_HOME/data"
BACKUP_DIR="$TRAVEL_HOME/backups"
STATE_DIR="$TRAVEL_HOME/state"
ENV_PATH="$CONFIG_DIR/.env"
COMPOSE_PATH="$CONFIG_DIR/docker-compose.yml"
MANAGER_PATH="$BIN_DIR/travel-server"
REPOSITORY="${TRAVEL_GITHUB_REPOSITORY:-lazyxu/travel}"
SOURCE_REF="${TRAVEL_SOURCE_REF:-master}"
RAW_BASE="https://raw.githubusercontent.com/$REPOSITORY/$SOURCE_REF"

compose() {
  docker compose --env-file "$ENV_PATH" -f "$COMPOSE_PATH" "$@"
}

say() { printf '[travel] %s\n' "$*"; }
die() { printf '[travel] ERROR: %s\n' "$*" >&2; exit 1; }

fetch_to() {
  local url="$1" dest="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --retry 3 --connect-timeout 15 "$url" -o "$dest"
  elif command -v wget >/dev/null 2>&1; then
    wget -q --tries=3 --timeout=15 -O "$dest" "$url"
  else
    die '需要 curl 或 wget'
  fi
}

random_hex() {
  local bytes="${1:-24}"
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$bytes"
  else
    od -An -N "$bytes" -tx1 /dev/urandom | tr -d ' \n'
  fi
}

check_host() {
  command -v docker >/dev/null 2>&1 || die '未检测到 Docker Engine'
  docker info >/dev/null 2>&1 || die '当前用户无法访问 Docker，请先配置 Docker/rootless Docker'
  docker compose version >/dev/null 2>&1 || die '需要 Docker Compose v2（docker compose）'
}

prepare_layout() {
  mkdir -p "$CONFIG_DIR" "$BIN_DIR" "$DATA_DIR/postgres" "$BACKUP_DIR" "$STATE_DIR"
  chmod 700 "$TRAVEL_HOME" "$CONFIG_DIR" "$BIN_DIR" "$DATA_DIR" "$BACKUP_DIR" "$STATE_DIR" || true
}

write_env_if_missing() {
  if [[ -f "$ENV_PATH" ]]; then
    return
  fi
  local db_password admin_password session_secret
  db_password="$(random_hex 24)"
  admin_password="$(random_hex 10)"
  session_secret="$(random_hex 32)"
  cat > "$ENV_PATH" <<ENV
POSTGRES_PASSWORD=$db_password
TRAVEL_ADMIN_PASSWORD=$admin_password
TRAVEL_SESSION_SECRET=$session_secret
TRAVEL_BIND=${TRAVEL_BIND:-0.0.0.0}
TRAVEL_PORT=${TRAVEL_PORT:-3080}
TRAVEL_COOKIE_SECURE=${TRAVEL_COOKIE_SECURE:-0}
TRAVEL_AUTH_DISABLED=0
TRAVEL_IMAGE=${TRAVEL_IMAGE:-ghcr.io/lazyxu/travel:master}
TRAVEL_POSTGRES_IMAGE=${TRAVEL_POSTGRES_IMAGE:-postgres:17-alpine}
TRAVEL_VERSION=$SOURCE_REF
TRAVEL_POSTGRES_DATA_DIR=$DATA_DIR/postgres
TRAVEL_DB_POOL_MAX=10
TRAVEL_APP_MEMORY_LIMIT=512m
TRAVEL_APP_CPU_LIMIT=1.0
TRAVEL_APP_PIDS_LIMIT=256
TRAVEL_POSTGRES_MEMORY_LIMIT=512m
TRAVEL_POSTGRES_CPU_LIMIT=0.75
TRAVEL_POSTGRES_PIDS_LIMIT=256
TRAVEL_LOG_MAX_SIZE=10m
TRAVEL_LOG_MAX_FILES=5
TRAVEL_BACKUP_RETENTION_DAYS=7
ENV
  chmod 600 "$ENV_PATH"
  printf '%s' "$admin_password" > "$STATE_DIR/initial-password"
}

build_app_from_source() {
  local tmp archive src_dir image
  tmp="$(mktemp -d "$STATE_DIR/source-build.XXXXXX")"
  archive="$tmp/source.tar.gz"
  trap 'rm -rf "${tmp:-}"' RETURN
  say "GHCR 应用镜像拉取失败，改为从 GitHub $SOURCE_REF 源码本地构建..."
  fetch_to "https://github.com/$REPOSITORY/archive/refs/heads/$SOURCE_REF.tar.gz" "$archive"
  tar -xzf "$archive" -C "$tmp"
  src_dir="$(find "$tmp" -mindepth 1 -maxdepth 1 -type d -print -quit)"
  [[ -n "$src_dir" ]] || die '源码包解压失败'
  image="$(grep -E '^TRAVEL_IMAGE=' "$ENV_PATH" | tail -1 | cut -d= -f2- || true)"
  image="${image:-ghcr.io/lazyxu/travel:master}"
  docker build -t "$image" "$src_dir"
  trap - RETURN
  rm -rf "$tmp"
}

pull_images() {
  say '拉取 PostgreSQL 镜像...'
  compose pull postgres
  say '拉取 travel 应用镜像...'
  if ! compose pull app; then
    build_app_from_source
  fi
}

refresh_deploy_files() {
  local compose_tmp manager_tmp
  compose_tmp="$(mktemp "$CONFIG_DIR/.compose.XXXXXX")"
  manager_tmp="$(mktemp "$BIN_DIR/.manager.XXXXXX")"
  trap 'rm -f "${compose_tmp:-}" "${manager_tmp:-}"' RETURN
  fetch_to "$RAW_BASE/deploy/docker-compose.yml" "$compose_tmp"
  fetch_to "$RAW_BASE/deploy/install-server.sh" "$manager_tmp"
  chmod 700 "$manager_tmp"
  mv "$compose_tmp" "$COMPOSE_PATH"
  mv "$manager_tmp" "$MANAGER_PATH"
  chmod 600 "$COMPOSE_PATH"
  chmod 700 "$MANAGER_PATH"
  trap - RETURN
}

wait_healthy() {
  local attempts=45
  while (( attempts > 0 )); do
    if compose exec -T app node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
    attempts=$((attempts - 1))
  done
  compose ps || true
  compose logs --tail=120 app || true
  die '服务未能在预期时间内通过健康检查'
}

show_access() {
  local bind port password
  bind="$(grep -E '^TRAVEL_BIND=' "$ENV_PATH" | tail -1 | cut -d= -f2- || true)"
  port="$(grep -E '^TRAVEL_PORT=' "$ENV_PATH" | tail -1 | cut -d= -f2- || true)"
  password="$(grep -E '^TRAVEL_ADMIN_PASSWORD=' "$ENV_PATH" | tail -1 | cut -d= -f2- || true)"
  [[ -n "$port" ]] || port=3080
  say "已启动。浏览器访问：http://${bind:-0.0.0.0}:$port"
  say "手机在同一局域网时，请用服务器局域网 IP + :$port 访问。"
  if [[ -f "$STATE_DIR/initial-password" ]]; then
    say "初始访问密码：$password"
    rm -f "$STATE_DIR/initial-password"
  fi
  say "管理命令：$MANAGER_PATH status | update | logs | doctor | backup"
  if [[ -w /usr/local/bin || "$(id -u)" -eq 0 ]]; then
    ln -sf "$MANAGER_PATH" /usr/local/bin/travel-server 2>/dev/null || true
    [[ -x /usr/local/bin/travel-server ]] && say '已安装命令：travel-server'
  else
    say "可选：sudo ln -sf '$MANAGER_PATH' /usr/local/bin/travel-server"
  fi
}

backup() {
  [[ -f "$ENV_PATH" && -f "$COMPOSE_PATH" ]] || die 'travel 尚未安装'
  mkdir -p "$BACKUP_DIR"
  local stamp target retention
  stamp="$(date '+%Y%m%d-%H%M%S')"
  target="$BACKUP_DIR/travel-$stamp.sql.gz"
  say "备份数据库 -> $target"
  compose exec -T postgres pg_dump -U travel -d travel | gzip -c > "$target"
  chmod 600 "$target"
  retention="$(grep -E '^TRAVEL_BACKUP_RETENTION_DAYS=' "$ENV_PATH" | tail -1 | cut -d= -f2- || true)"
  retention="${retention:-7}"
  find "$BACKUP_DIR" -type f -name 'travel-*.sql.gz' -mtime "+$retention" -delete 2>/dev/null || true
  say '备份完成'
}

install() {
  check_host
  prepare_layout
  write_env_if_missing
  refresh_deploy_files
  pull_images
  say '启动 travel...'
  compose up -d --remove-orphans
  wait_healthy
  show_access
}

update() {
  check_host
  [[ -f "$ENV_PATH" && -f "$COMPOSE_PATH" ]] || die 'travel 尚未安装，请先执行安装命令'
  say '更新前备份数据库...'
  backup
  say '刷新部署文件...'
  refresh_deploy_files
  pull_images
  say '滚动重建容器...'
  compose up -d --remove-orphans
  wait_healthy
  say '更新完成'
  compose ps
}

status() {
  [[ -f "$ENV_PATH" && -f "$COMPOSE_PATH" ]] || die 'travel 尚未安装'
  say "home: $TRAVEL_HOME"
  say "config: $CONFIG_DIR"
  say "postgres data: $DATA_DIR/postgres"
  say "backups: $BACKUP_DIR"
  compose ps
}

logs() {
  [[ -f "$ENV_PATH" && -f "$COMPOSE_PATH" ]] || die 'travel 尚未安装'
  compose logs -f --tail=200 "${@:2}"
}

doctor() {
  check_host
  say "travel home: $TRAVEL_HOME"
  docker --version
  docker compose version
  if [[ -f "$ENV_PATH" && -f "$COMPOSE_PATH" ]]; then
    compose config --quiet && say 'compose config: OK'
    compose ps
    if compose exec -T app node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
      say 'app health: OK'
    else
      say 'app health: FAILED'
      return 1
    fi
  else
    say 'installation: not installed'
  fi
}

restart() {
  [[ -f "$ENV_PATH" && -f "$COMPOSE_PATH" ]] || die 'travel 尚未安装'
  compose restart
  wait_healthy
}

stop() {
  [[ -f "$ENV_PATH" && -f "$COMPOSE_PATH" ]] || die 'travel 尚未安装'
  compose down
}

password() {
  [[ -f "$ENV_PATH" ]] || die 'travel 尚未安装'
  grep -E '^TRAVEL_ADMIN_PASSWORD=' "$ENV_PATH" | tail -1 | cut -d= -f2-
}

case "${1:-install}" in
  install) install ;;
  update) update ;;
  status) status ;;
  logs) logs "$@" ;;
  doctor) doctor ;;
  backup) backup ;;
  restart) restart ;;
  stop) stop ;;
  password) password ;;
  *)
    cat <<USAGE
Usage: travel-server <command>

Commands:
  install   Install/start travel
  update    Backup, pull latest deployment files/images, and restart
  status    Show Docker Compose status and persistent paths
  logs      Follow logs (optionally: travel-server logs app|postgres)
  doctor    Check Docker, Compose config and app health
  backup    Create PostgreSQL dump under ~/.travel/backups
  restart   Restart services
  stop      Stop services
  password  Print the local admin password
USAGE
    exit 2
    ;;
esac

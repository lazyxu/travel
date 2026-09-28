#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

TRAVEL_HOME="${TRAVEL_HOME:-$HOME/.travel}"
CONFIG_DIR="$TRAVEL_HOME/config"
BIN_DIR="$TRAVEL_HOME/bin"
DATA_DIR="$TRAVEL_HOME/data"
BACKUP_DIR="$TRAVEL_HOME/backups"
STATE_DIR="$TRAVEL_HOME/state"
LOG_DIR="$TRAVEL_HOME/logs"
mkdir -p "$LOG_DIR" 2>/dev/null || true
RUN_ID="$(date '+%Y%m%d-%H%M%S')-$"
LOG_FILE="${TRAVEL_LOG_FILE:-$LOG_DIR/travel-server-$RUN_ID.log}"
HTTP_CONNECT_TIMEOUT="${TRAVEL_HTTP_CONNECT_TIMEOUT:-15}"
HTTP_MAX_TIME="${TRAVEL_HTTP_MAX_TIME:-60}"
HTTP_RETRIES="${TRAVEL_HTTP_RETRIES:-3}"
ENV_PATH="$CONFIG_DIR/.env"
COMPOSE_PATH="$CONFIG_DIR/docker-compose.yml"
MANAGER_PATH="$BIN_DIR/travel-server"
REPOSITORY="${TRAVEL_GITHUB_REPOSITORY:-lazyxu/travel}"
SOURCE_REF="${TRAVEL_SOURCE_REF:-master}"
RAW_BASE="https://raw.githubusercontent.com/$REPOSITORY/$SOURCE_REF"

compose() {
  docker compose --env-file "$ENV_PATH" -f "$COMPOSE_PATH" "$@"
}

timestamp() { date '+%Y-%m-%d %H:%M:%S'; }

say() {
  local line
  line="[travel][$(timestamp)] $*"
  printf '%s\n' "$line"
  printf '%s\n' "$line" >> "$LOG_FILE" 2>/dev/null || true
}

die() {
  local line
  line="[travel][$(timestamp)] ERROR: $*"
  printf '%s\n' "$line" >&2
  printf '%s\n' "$line" >> "$LOG_FILE" 2>/dev/null || true
  exit 1
}

fetch_to() {
  local url="$1" dest="$2" label="${3:-$(basename "$2")}"
  local attempt rc started elapsed stats err_tmp
  [[ "$HTTP_RETRIES" =~ ^[1-9][0-9]*$ ]] || die "TRAVEL_HTTP_RETRIES 必须是正整数"
  [[ "$HTTP_CONNECT_TIMEOUT" =~ ^[1-9][0-9]*$ ]] || die "TRAVEL_HTTP_CONNECT_TIMEOUT 必须是正整数"
  [[ "$HTTP_MAX_TIME" =~ ^[1-9][0-9]*$ ]] || die "TRAVEL_HTTP_MAX_TIME 必须是正整数"

  err_tmp="$(mktemp "$STATE_DIR/.fetch-error.XXXXXX")"
  trap 'rm -f "${err_tmp:-}"' RETURN

  for ((attempt = 1; attempt <= HTTP_RETRIES; attempt++)); do
    rm -f "$dest"
    : > "$err_tmp"
    started="$(date +%s)"
    say "下载 $label：第 $attempt/$HTTP_RETRIES 次，连接超时 ${HTTP_CONNECT_TIMEOUT}s，总超时 ${HTTP_MAX_TIME}s"
    say "下载地址：$url"

    if command -v curl >/dev/null 2>&1; then
      if stats="$(curl -fL --silent --show-error         --connect-timeout "$HTTP_CONNECT_TIMEOUT"         --max-time "$HTTP_MAX_TIME"         --output "$dest"         --write-out 'HTTP=%{http_code} bytes=%{size_download} total=%{time_total}s speed=%{speed_download}B/s remote=%{remote_ip}'         "$url" 2>"$err_tmp")"; then
        elapsed=$(( $(date +%s) - started ))
        say "下载完成 $label：$stats，墙钟耗时 ${elapsed}s"
        trap - RETURN
        rm -f "$err_tmp"
        return 0
      else
        rc=$?
      fi
    elif command -v wget >/dev/null 2>&1; then
      if command -v timeout >/dev/null 2>&1; then
        if timeout "${HTTP_MAX_TIME}s" wget -q --tries=1 --timeout="$HTTP_CONNECT_TIMEOUT" -O "$dest" "$url" 2>"$err_tmp"; then
          rc=0
        else
          rc=$?
        fi
      elif wget -q --tries=1 --timeout="$HTTP_CONNECT_TIMEOUT" -O "$dest" "$url" 2>"$err_tmp"; then
        rc=0
      else
        rc=$?
      fi

      if [[ "$rc" -eq 0 ]]; then
        elapsed=$(( $(date +%s) - started ))
        say "下载完成 $label：bytes=$(wc -c < "$dest" | tr -d ' ')，墙钟耗时 ${elapsed}s"
        trap - RETURN
        rm -f "$err_tmp"
        return 0
      fi
    else
      trap - RETURN
      rm -f "$err_tmp"
      die '需要 curl 或 wget'
    fi

    elapsed=$(( $(date +%s) - started ))
    say "下载失败 $label：exit=$rc，墙钟耗时 ${elapsed}s"
    if [[ -s "$err_tmp" ]]; then
      while IFS= read -r line; do
        [[ -n "$line" ]] && say "下载器：$line"
      done < "$err_tmp"
    fi
    rm -f "$dest"
    if (( attempt < HTTP_RETRIES )); then
      say "等待 $((attempt * 2))s 后重试 $label..."
      sleep $((attempt * 2))
    fi
  done

  trap - RETURN
  rm -f "$err_tmp"
  die "下载 $label 失败：已重试 $HTTP_RETRIES 次。完整日志：$LOG_FILE"
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
  mkdir -p "$CONFIG_DIR" "$BIN_DIR" "$DATA_DIR/postgres" "$BACKUP_DIR" "$STATE_DIR" "$LOG_DIR"
  chmod 700 "$TRAVEL_HOME" "$CONFIG_DIR" "$BIN_DIR" "$DATA_DIR" "$BACKUP_DIR" "$STATE_DIR" "$LOG_DIR" || true
}

write_env_if_missing() {
  if [[ -f "$ENV_PATH" ]]; then
    return
  fi
  local db_password session_secret
  db_password="$(random_hex 24)"
  session_secret="$(random_hex 32)"
  cat > "$ENV_PATH" <<ENV
POSTGRES_PASSWORD=$db_password
TRAVEL_ADMIN_PASSWORD=
TRAVEL_SESSION_SECRET=$session_secret
TRAVEL_BIND=${TRAVEL_BIND:-0.0.0.0}
TRAVEL_PORT=${TRAVEL_PORT:-3080}
TRAVEL_COOKIE_SECURE=${TRAVEL_COOKIE_SECURE:-0}
TRAVEL_AUTH_DISABLED=1
TRAVEL_BAIDU_MAP_AK=${TRAVEL_BAIDU_MAP_AK:-}
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
}

ensure_optional_env_defaults() {
  [[ -f "$ENV_PATH" ]] || return 0
  grep -q '^TRAVEL_BAIDU_MAP_AK=' "$ENV_PATH" || printf '\nTRAVEL_BAIDU_MAP_AK=\n' >> "$ENV_PATH"
}

set_env_value() {
  local key="$1" value="$2" tmp
  tmp="$(mktemp "$CONFIG_DIR/.env.XXXXXX")"
  awk -v key="$key" -v value="$value" '
    BEGIN { found = 0 }
    index($0, key "=") == 1 { print key "=" value; found = 1; next }
    { print }
    END { if (!found) print key "=" value }
  ' "$ENV_PATH" > "$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$ENV_PATH"
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
  local compose_tmp manager_tmp compose_sha manager_sha
  mkdir -p "$CONFIG_DIR" "$BIN_DIR" "$STATE_DIR" "$LOG_DIR"
  compose_tmp="$(mktemp "$CONFIG_DIR/.compose.XXXXXX")"
  manager_tmp="$(mktemp "$BIN_DIR/.manager.XXXXXX")"
  trap 'rm -f "${compose_tmp:-}" "${manager_tmp:-}"' RETURN

  say "[部署文件 1/6] 下载 docker-compose.yml"
  fetch_to "$RAW_BASE/deploy/docker-compose.yml" "$compose_tmp" "docker-compose.yml"

  say "[部署文件 2/6] 下载 install-server.sh"
  fetch_to "$RAW_BASE/deploy/install-server.sh" "$manager_tmp" "install-server.sh"

  say "[部署文件 3/6] 校验 install-server.sh Bash 语法"
  if ! bash -n "$manager_tmp" >>"$LOG_FILE" 2>&1; then
    die "新 install-server.sh 语法校验失败，未覆盖现有文件。日志：$LOG_FILE"
  fi
  say "install-server.sh 语法校验通过"

  say "[部署文件 4/6] 校验 docker-compose.yml"
  if ! docker compose --env-file "$ENV_PATH" -f "$compose_tmp" config --quiet >>"$LOG_FILE" 2>&1; then
    die "新 docker-compose.yml 校验失败，未覆盖现有文件。日志：$LOG_FILE"
  fi
  say "docker-compose.yml 校验通过"

  if command -v sha256sum >/dev/null 2>&1; then
    compose_sha="$(sha256sum "$compose_tmp" | awk '{print $1}')"
    manager_sha="$(sha256sum "$manager_tmp" | awk '{print $1}')"
    say "下载文件 SHA256：compose=${compose_sha:0:12} manager=${manager_sha:0:12}"
  fi

  say "[部署文件 5/6] 保存上一版部署文件"
  [[ -f "$COMPOSE_PATH" ]] && cp -p "$COMPOSE_PATH" "$STATE_DIR/docker-compose.yml.prev" || true
  [[ -f "$MANAGER_PATH" ]] && cp -p "$MANAGER_PATH" "$STATE_DIR/travel-server.prev" || true

  say "[部署文件 6/6] 原子替换部署文件"
  chmod 700 "$manager_tmp"
  mv "$compose_tmp" "$COMPOSE_PATH"
  mv "$manager_tmp" "$MANAGER_PATH"
  chmod 600 "$COMPOSE_PATH"
  chmod 700 "$MANAGER_PATH"
  trap - RETURN
  say "部署文件刷新完成"
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
  local bind port auth_disabled
  bind="$(grep -E '^TRAVEL_BIND=' "$ENV_PATH" | tail -1 | cut -d= -f2- || true)"
  port="$(grep -E '^TRAVEL_PORT=' "$ENV_PATH" | tail -1 | cut -d= -f2- || true)"
  auth_disabled="$(grep -E '^TRAVEL_AUTH_DISABLED=' "$ENV_PATH" | tail -1 | cut -d= -f2- || true)"
  [[ -n "$port" ]] || port=3080
  say "已启动。浏览器访问：http://${bind:-0.0.0.0}:$port"
  say "手机在同一局域网时，请用服务器局域网 IP + :$port 访问。"
  if [[ "${auth_disabled:-1}" == "1" ]]; then
    say '访问认证：关闭（当前无需密码）'
  else
    say '访问认证：已开启'
  fi
  say "管理命令：$MANAGER_PATH status | update | logs | doctor | backup"
  local baidu_ak_value
  baidu_ak_value="$(grep -E '^TRAVEL_BAIDU_MAP_AK=' "$ENV_PATH" | tail -1 | cut -d= -f2- || true)"
  if [[ -n "$baidu_ak_value" ]]; then
    say '百度 POI：已配置'
  else
    say '百度 POI：未配置（可运行 travel-server baidu-ak set）'
  fi
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
  say "日志文件：$LOG_FILE"
  check_host
  prepare_layout
  write_env_if_missing
  ensure_optional_env_defaults
  refresh_deploy_files
  pull_images
  say '启动 travel...'
  compose up -d --remove-orphans
  wait_healthy
  show_access
}

update() {
  mkdir -p "$LOG_DIR" "$STATE_DIR"
  say "日志文件：$LOG_FILE"
  say "更新源：$RAW_BASE"
  say "HTTP 策略：retries=$HTTP_RETRIES connect_timeout=${HTTP_CONNECT_TIMEOUT}s max_time=${HTTP_MAX_TIME}s"
  check_host
  [[ -f "$ENV_PATH" && -f "$COMPOSE_PATH" ]] || die 'travel 尚未安装，请先执行安装命令'
  ensure_optional_env_defaults
  say '更新前备份数据库...'
  backup
  say '刷新部署文件...'
  refresh_deploy_files
  say '部署文件已刷新，开始更新容器镜像...'
  pull_images
  say '镜像准备完成，滚动重建容器...'
  compose up -d --remove-orphans
  wait_healthy
  say '更新完成'
  say "完整更新日志：$LOG_FILE"
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
  local auth_disabled
  auth_disabled="$(grep -E '^TRAVEL_AUTH_DISABLED=' "$ENV_PATH" | tail -1 | cut -d= -f2- || true)"
  if [[ "${auth_disabled:-1}" == "1" ]]; then
    say '访问认证当前已关闭，未启用访问密码。'
    return 0
  fi
  grep -E '^TRAVEL_ADMIN_PASSWORD=' "$ENV_PATH" | tail -1 | cut -d= -f2-
}

baidu_ak() {
  [[ -f "$ENV_PATH" ]] || die 'travel 尚未安装'
  ensure_optional_env_defaults
  case "${2:-status}" in
    status)
      local current
      current="$(grep -E '^TRAVEL_BAIDU_MAP_AK=' "$ENV_PATH" | tail -1 | cut -d= -f2- || true)"
      if [[ -n "$current" ]]; then say '百度地图 AK：已配置'; else say '百度地图 AK：未配置'; fi
      ;;
    set)
      local ak
      read -r -s -p 'Baidu Map AK: ' ak
      printf '\n'
      [[ -n "$ak" ]] || die 'AK 不能为空'
      [[ "${#ak}" -le 128 ]] || die 'AK 长度异常'
      set_env_value TRAVEL_BAIDU_MAP_AK "$ak"
      say '百度地图 AK 已保存到 ~/.travel/config/.env'
      compose up -d app
      wait_healthy
      ;;
    clear)
      set_env_value TRAVEL_BAIDU_MAP_AK ""
      say '百度地图 AK 已清除'
      compose up -d app
      wait_healthy
      ;;
    *)
      die '用法：travel-server baidu-ak [status|set|clear]'
      ;;
  esac
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
  baidu-ak) baidu_ak "$@" ;;
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
  password  Print the local admin password when authentication is enabled
  baidu-ak  Configure Baidu Map AK securely (status|set|clear)
USAGE
    exit 2
    ;;
esac

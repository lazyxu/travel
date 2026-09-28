# travel

一个以手机端为主的轻量旅行规划网站。第一版支持：

- 多旅行管理：创建、编辑、删除旅行；
- 按日期自动生成行程天数；
- 每日时间线：交通、景点、餐饮、住宿、购物、其他；
- 行程新增、编辑、删除；
- 小红书（XHS）和大众点评链接保存与一键打开；
- 支持直接粘贴带链接的分享文案，前端自动提取第一个 `http/https` URL；
- 旅行待办：截止日期、备注、完成状态；
- 移动端优先 UI；
- 单用户密码登录；
- PostgreSQL 持久化；
- Docker Compose 部署；
- `travel-server` 一键更新、状态、日志、诊断与备份。

## 架构

```text
Browser / Mobile
      |
      v
travel-app (Node.js + Express, :8080)
      |
      v
PostgreSQL 17
```

宿主机默认持久化布局参考 xDrive：

```text
~/.travel/
├── bin/
│   └── travel-server
├── config/
│   ├── .env
│   └── docker-compose.yml
├── data/
│   └── postgres/
├── backups/
└── state/
```

PostgreSQL 数据默认位于 `~/.travel/data/postgres`，删除/重建容器不会删除旅行数据。

## 一键安装

要求 Linux、Docker Engine、Docker Compose v2，以及 `curl` 或 `wget`。

推荐使用和 xDrive 一样的“先下载到临时文件再执行”的方式，避免管道输入被子进程误用：

```bash
tmp="$(mktemp)" && \
curl -fsSL --retry 3 --connect-timeout 15 \
  https://raw.githubusercontent.com/lazyxu/travel/master/deploy/install-server.sh \
  -o "$tmp" && \
bash "$tmp"; rc=$?; rm -f "$tmp"; exit "$rc"
```

默认访问端口为 `3080`，安装完成后脚本会打印首次访问密码。手机与服务器在同一局域网时，使用：

```text
http://服务器局域网IP:3080
```

默认容器：

```text
travel-app
travel-postgres
```

## 更新

安装完成后优先使用宿主机管理命令：

```bash
travel-server update
```

更新流程会先执行 PostgreSQL 备份，再刷新 Compose/管理脚本，拉取 `ghcr.io/lazyxu/travel:master`，最后重建容器并做健康检查。

如果 `/usr/local/bin` 不可写，安装器会提示建立软链接；也可以直接运行：

```bash
~/.travel/bin/travel-server update
```

## 常用管理命令

```bash
travel-server status
travel-server logs
travel-server logs app
travel-server doctor
travel-server backup
travel-server restart
travel-server stop
travel-server password
```

备份文件保存到：

```text
~/.travel/backups/travel-YYYYMMDD-HHMMSS.sql.gz
```

默认保留 7 天，可在 `~/.travel/config/.env` 修改 `TRAVEL_BACKUP_RETENTION_DAYS`。

## 配置

主要配置位于 `~/.travel/config/.env`：

```dotenv
TRAVEL_BIND=0.0.0.0
TRAVEL_PORT=3080
TRAVEL_IMAGE=ghcr.io/lazyxu/travel:master
TRAVEL_COOKIE_SECURE=0
```

如果通过 HTTPS 反向代理访问，建议把：

```dotenv
TRAVEL_COOKIE_SECURE=1
```

然后执行：

```bash
travel-server restart
```

如果只想本机访问，把：

```dotenv
TRAVEL_BIND=127.0.0.1
```

## 本地开发

```bash
npm install
npm test
npm run check
npm start
```

应用需要 PostgreSQL，可直接复用 `deploy/docker-compose.yml`，或自行提供 `DATABASE_URL`。

## CI / 镜像

每次推送到 `master`：

1. Node.js 语法检查；
2. 单元测试；
3. Docker Compose 配置校验；
4. Docker 镜像构建；
5. 全部通过后发布：
   - `ghcr.io/lazyxu/travel:master`
   - `ghcr.io/lazyxu/travel:sha-<commit>`

`v*` tag 同时发布版本 tag 和 `latest`。

## 当前版本边界

这是第一版 MVP，目前主要面向个人/家庭旅行协作前的单用户场景。暂未加入多账号、权限协作、地图路线优化、图片上传、票据/预订解析和小红书/大众点评内容抓取；第一版只保存并打开外部链接，不抓取第三方页面内容。

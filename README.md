# travel

一个以手机端为主的轻量旅行规划网站。第一版支持：

- 多旅行管理：创建、编辑、删除旅行；
- 按日期自动生成行程天数；
- 每日时间线：交通、景点、餐饮、住宿、购物、其他，并显示对应分类图标；支持单点时间或开始—结束时间范围；
- 行程新增、编辑、删除；支持手机拖动排序、拖到其他 Day 跨天移动，也可在编辑表单中直接选择日期；
- 每条行程支持最多 12 张图片：可用外部图片 URL，也可从手机相册选择；浏览器压缩后上传到 `~/.travel/data/uploads`；
- 每条行程可保存地址、经纬度和坐标类型，可直接用百度地图打开；当天至少两个同坐标类型的坐标点时可生成百度地图多点路线，并可选择驾车、步行、公交或骑行；
- 参考入口统一为泛化多入口模型，最多 12 个；支持微信小程序、抖音、美团、大众点评、小红书、闲鱼和普通网页，网页会尝试自动提取标题；
- 旅行待办：截止日期、备注、完成状态；
- 移动端优先 UI；旅行列表、每日行程和待办均有独立 URL，可直接刷新、收藏和分享；
- PWA：可添加到手机主屏幕，并缓存应用静态壳用于弱网启动；行程数据仍以服务器在线数据为准；
- 行程地点支持百度 POI 搜索，选择结果后自动填地址与 BD-09 坐标；
- 默认关闭访问认证，打开网页即可直接使用；后续可按需开启密码登录；
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
│   ├── postgres/
│   └── uploads/
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

默认访问端口为 `3080`，当前默认**不启用密码登录**，打开网页即可直接使用。手机与服务器在同一局域网时，使用：

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
travel-server password   # 仅在后续开启认证时使用
```

备份会同时保存 PostgreSQL 数据库和本地上传图片，文件保存到：

```text
~/.travel/backups/travel-YYYYMMDD-HHMMSS.sql.gz
~/.travel/backups/travel-YYYYMMDD-HHMMSS.uploads.tar.gz
```

默认保留 7 天，可在 `~/.travel/config/.env` 修改 `TRAVEL_BACKUP_RETENTION_DAYS`。

## 配置

主要配置位于 `~/.travel/config/.env`：

```dotenv
TRAVEL_BIND=0.0.0.0
TRAVEL_PORT=3080
TRAVEL_IMAGE=ghcr.io/lazyxu/travel:master
TRAVEL_COOKIE_SECURE=0
TRAVEL_BAIDU_MAP_AK=
TRAVEL_UPLOAD_DATA_DIR=~/.travel/data/uploads
```

### 百度地点搜索

百度 Place Suggestion Web API 需要服务端 AK。AK 不写入仓库；安装后运行：

```bash
travel-server baidu-ak set
```

命令会隐藏输入并保存到 `~/.travel/config/.env` 的 `TRAVEL_BAIDU_MAP_AK`。状态和清除：

```bash
travel-server baidu-ak status
travel-server baidu-ak clear
```

配置完成后，新增/编辑行程时可以“搜索百度地点 → 选择 POI → 自动填入地址、纬度、经度和 BD-09 坐标类型”。

### HTTPS

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

### 后续开启密码登录

当前默认配置是：

```dotenv
TRAVEL_AUTH_DISABLED=1
TRAVEL_ADMIN_PASSWORD=
```

后续需要开启时，在 `~/.travel/config/.env` 中设置：

```dotenv
TRAVEL_AUTH_DISABLED=0
TRAVEL_ADMIN_PASSWORD=你的访问密码
```

然后执行：

```bash
travel-server restart
```

`TRAVEL_SESSION_SECRET` 在首次安装时仍会自动随机生成，因此以后开启认证不需要重新安装或迁移数据库。

## 页面 URL

```text
/                              旅行列表
/trips/:tripId/day/:dayId      某天行程
/trips/:tripId/todos           旅行待办
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

这是第一版 MVP，目前主要面向个人/家庭旅行协作前的单用户场景。暂未加入多账号、权限协作、智能路线优化、票据/预订解析和第三方正文内容抓取。网页参考入口会在保存时读取有限大小的公开网页 HTML 以提取标题，并对本机/内网地址做拦截；微信小程序口令仅保存并复制，不做正文抓取。百度 POI 搜索仅通过服务端代理调用百度地图 API，AK 不下发到浏览器。

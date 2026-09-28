# travel

一个以手机端为主的轻量旅行规划网站。第一版支持：

- 多旅行管理：创建、编辑、删除旅行；
- 按日期自动生成行程天数；
- 每日时间线：交通、景点、餐饮、住宿、购物、其他，并显示对应分类图标；支持单点时间或开始—结束时间范围；
- 行程新增、编辑、删除；支持手机拖动排序、拖到其他 Day 跨天移动，也可在编辑表单中直接选择日期；
- 每条行程支持最多 12 张图片：卡片式缩略图管理，可删除、拖动排序、从手机相册添加或单独添加网络图片；相册图片会先在浏览器压缩后上传到 `~/.travel/data/uploads`；
- 每条行程可保存地址与百度 POI 定位；两站之间可单独选择 🚕驾车 / 🚶步行 / 🚇公交并打开对应百度地图 App 路线；只有当天所有分段交通方式一致时才显示全天多点路线，混合交通时仅保留分段导航；
- 参考入口采用卡片式编辑器，最多 12 个；区分“自动标题”和“自定义展示标题”。用户写标题时不会再访问第三方网页；自动标题会保留并缓存，避免每次保存都重新抓取；
- 酒店、飞机、高铁/火车支持结构化字段（入住退房、航班号/机场/航站楼、车次/车站/车厢/座位等）；
- 费用与行程联动：费用直接显示在对应行程卡片内，可新增、编辑、标记已支付；新建行程时可与首笔费用在同一个数据库事务中原子创建；旅行总预算仍保留；
- 旅行待办：截止日期、备注、完成状态；
- 只读分享：每次旅行最多一个活动分享链接；可重新生成并立即废止旧链接，可单独控制图片、参考链接、备注、酒店电话和费用是否公开；确认号始终不公开；
- 移动端优先 UI；旅行列表、每日行程和待办均有独立 URL，可直接刷新、收藏和分享；
- PWA：可添加到手机主屏幕并缓存静态壳；浏览器会周期检查服务端 commit，发现新版本后显示“立即刷新”，由用户确认后切换到新 Service Worker；
- 行程地点支持百度 POI 搜索，选择结果后自动填地址与 BD-09 坐标；
- 默认关闭访问认证，打开网页即可直接使用；后续可按需开启密码登录；
- PostgreSQL 持久化；
- Docker Compose 部署；
- `travel-server` 一键更新、版本信息、状态、日志、诊断、备份验证与恢复。

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

PostgreSQL 数据默认位于 `~/.travel/data/postgres`，删除/重建容器不会删除旅行数据。数据库升级使用 `schema_migrations` 记录版本，启动时只执行尚未应用的迁移。

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
travel-server version
travel-server cleanup --dry-run
travel-server cleanup
travel-server backups
travel-server backup verify latest
travel-server restore latest
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

默认保留 7 天，可在 `~/.travel/config/.env` 修改 `TRAVEL_BACKUP_RETENTION_DAYS`。本地上传图片会在启动和行程变更后清理未被数据库引用的孤儿文件；也可用 `travel-server cleanup --dry-run` 先预览。

### 备份验证与恢复

列出现有时间点：

```bash
travel-server backups
```

验证最新备份是否真的能恢复。该命令会校验 gzip / uploads tar，并创建临时 PostgreSQL 数据库完整导入 SQL：

```bash
travel-server backup verify latest
```

也可以指定时间点：

```bash
travel-server backup verify 20260928-180000
```

恢复前建议先运行 verify。恢复命令会再次验证目标备份、自动创建当前状态的紧急备份、停止 app、重建 travel 数据库、恢复 uploads、重新启动应用并运行尚未应用的 migration：

```bash
travel-server restore 20260928-180000
```

恢复需要手工输入 `RESTORE` 确认。明确要用于无人值守脚本时可增加：

```bash
travel-server restore 20260928-180000 --yes
```

也支持恢复最新备份：

```bash
travel-server restore latest
```

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

### 路线规则

交通方式按“相邻两站”分别保存。拖拽行程时，两站之间的交通段本身也是有效落点。

如果某一天所有分段都是同一种方式，例如全部驾车，则顶部显示“🚕 全天驾车路线”，并通过百度地图 App 打开多点路线。如果一天内混合了驾车、步行和公交，则不再生成误导性的单一全天路线，只显示每一段自己的导航入口。

### 只读分享隐私

分享管理中可以控制：

- 图片；
- 参考链接；
- 备注；
- 酒店电话；
- 费用。

默认不分享备注、酒店电话和费用。订单/确认号始终不会出现在公共分享接口中。服务器只保存分享 token 的 SHA-256 哈希，因此已有链接关闭弹窗后无法再次还原；需要重新获取链接时，请使用“重新生成并废止旧链接”。

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

配置完成后，新增/编辑行程时可以“搜索百度地点 → 选择 POI”，或直接粘贴百度地图分享链接。服务端会尽量补齐地点名称、BD-09 坐标和百度 POI UID；这些技术坐标字段不会显示在普通前端表单中。

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
/share/:token                   旅行只读分享
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

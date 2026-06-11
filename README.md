# Server Map — 离线地图服务

基于 Node.js + Express 的离线地图瓦片服务器，支持矢量瓦片、多风格切换和地点搜索。

## 功能

| 功能 | 说明 |
|------|------|
| 🗺️ 矢量瓦片 | 读取 `.mbtiles` 文件，提供 PBF 矢量瓦片 |
| 🎨 多风格 | 7 种地图风格一键切换（标准/暗黑/海军蓝/赛博朋克...） |
| 🔍 地点搜索 | 接入 Nominatim 数据库，支持中文正向/反向地理编码 |
| 🔤 字体/图标 | 内置 Open Sans / Arial Unicode MS 字体和 streets 符号库 |
| 📦 可执行文件 | `pkg` 打包为独立二进制，无需 Node.js 运行环境 |

## 快速开始（开发）

```bash
# 安装依赖
pnpm install

# 开发模式（热重载）
pnpm dev

# 生产启动
pnpm start
```

浏览器访问：

| 地址 | 页面 |
|------|------|
| `http://localhost:1234/search.html` | 搜索演示 |
| `http://localhost:1234/styles.html` | 风格切换演示 |
| `http://localhost:1234/index.html` | 基础地图 |

## 项目结构

```
server-map/
├── app/
│   ├── index.js                 # Express 应用入口
│   └── services/
│       ├── index.js             # 路由总注册
│       ├── styles/              # 地图样式 API
│       ├── tilesets/            # 瓦片 API（读取 .mbtiles）
│       ├── sprites/             # 符号库 API
│       ├── fonts/               # 字体 API（PBF 字形）
│       ├── assets/              # 静态资源（mapbox-gl.js）
│       └── search/              # 搜索 API（PostgreSQL）
├── bin/www                      # 启动脚本
├── data/
│   ├── tilesets/                # .mbtiles 瓦片文件
│   ├── styles/                  # 地图样式 JSON
│   ├── sprites/                 # 符号库图片
│   ├── fonts/                   # PBF 字形
│   ├── assets/                  # 前端静态库
│   └── export/                  # 数据库导出文件
├── public/                      # 前端演示页面
├── test/                        # 测试
└── dist/                        # pkg 打包输出
```

## 打包部署（通用）

```bash
pnpm dist    # 输出 dist/server-map-{win.exe,linux,macos}
```

部署结构（exe 放到任意位置即可，styles/fonts/sprites/public 已内置）：

```
部署目录/
├── server-map-win.exe          # Windows
│   （或 server-map-linux）     # Linux
└── data/
    └── tilesets/
        └── china.mbtiles       # 52GB，单独拷贝
```

**启动**：

```bash
# Windows (CMD / PowerShell)
server-map-win.exe

# Linux
chmod +x server-map-linux
PORT=1234 ./server-map-linux
```

---

## 搜索功能部署（PostgreSQL + Nominatim）

搜索功能依赖 PostgreSQL 数据库中的 Nominatim 地名数据。如果不需要搜索，可跳过此章节——瓦片和样式服务不受影响。

### 前置要求

| 组件 | Windows | Linux |
|------|---------|-------|
| PostgreSQL | ≥ 14 | ≥ 14 |
| PostGIS 扩展 | 安装时勾选 | `apt install postgis` |
| hstore 扩展 | 安装时勾选 | 内置 |

---

### Windows 部署

#### 1. 安装 PostgreSQL

从 [postgresql.org](https://www.postgresql.org/download/windows/) 下载安装，安装过程中务必勾选：

- ✅ **PostGIS** 空间扩展
- 设置 postgres 用户密码（如 `postgres`）
- 端口保持默认 `5432`

#### 2. 创建数据库并启用扩展

打开 **pgAdmin** 或 **SQL Shell (psql)**：

```sql
-- 创建 nominatim 数据库
CREATE DATABASE nominatim;
```

在命令行中启用扩展：

```powershell
# PowerShell
& "C:\Program Files\PostgreSQL\18\bin\psql" -U postgres -d nominatim
```

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS hstore;
-- 验证
SELECT extname FROM pg_extension;
-- 应输出: postgis, hstore（加上 plpgsql）
\q
```

#### 3. 导入数据

将 `data/export/nominatim_placex.dump`（2.2GB）拷贝到 Windows 机器，然后：

```powershell
& "C:\Program Files\PostgreSQL\18\bin\pg_restore" `
  -U postgres -d nominatim `
  --no-owner --no-privileges `
  "C:\path\to\nominatim_placex.dump"
```

导入时间约 10–20 分钟（取决于磁盘速度）。

#### 4. 验证

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql" -U postgres -d nominatim -c "SELECT count(*) FROM placex;"
# 预期输出: 8697443
```

#### 5. 启动服务

确保 `app/services/search/controller.js` 中的连接配置与实际一致：

```js
host: 'localhost',       // PostgreSQL 地址
database: 'nominatim',   // 数据库名
user: 'postgres',        // 用户名
password: 'postgres',    // 密码
```

启动 server-map 后验证搜索：

```
http://localhost:1234/api/search/status       → {"status":"OK","placex_count":8697443}
http://localhost:1234/api/search?q=上海       → [{"display_name":"上海市",...}]
```

---

### Linux 部署

#### 1. 安装 PostgreSQL + PostGIS

```bash
# Ubuntu / Debian
sudo apt update
sudo apt install -y postgresql postgresql-contrib postgis

# CentOS / RHEL
sudo dnf install -y postgresql-server postgresql-contrib postgis
```

启动并设置密码：

```bash
sudo systemctl enable --now postgresql
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"
```

#### 2. 创建数据库并启用扩展

```bash
sudo -u postgres psql <<EOF
CREATE DATABASE nominatim;
\c nominatim
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS hstore;
SELECT extname FROM pg_extension;
EOF
```

预期输出：`postgis`, `hstore`, `plpgsql`。

#### 3. 导入数据

```bash
# 上传 dump 文件到服务器
scp data/export/nominatim_placex.dump user@server:/tmp/

# 导入
sudo -u postgres pg_restore \
  -d nominatim \
  --no-owner --no-privileges \
  /tmp/nominatim_placex.dump
```

#### 4. 验证

```bash
sudo -u postgres psql -d nominatim -c "SELECT count(*) FROM placex;"
# 预期输出: 8697443
```

#### 5. 允许 TCP 连接（如需远程访问）

编辑 `pg_hba.conf`（路径如 `/etc/postgresql/16/main/pg_hba.conf`），添加：

```
# 允许本地 TCP 连接
host    nominatim    postgres    127.0.0.1/32    md5
```

然后重启：

```bash
sudo systemctl restart postgresql
```

#### 6. 启动服务 + 开机自启

参考 [systemd 配置](#linux-开机自启-systemd) 章节。

---

## API 端点

### 瓦片

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/tilesets` | 列出所有瓦片集 |
| GET | `/api/tilesets/:id/tilejson` | 瓦片集元数据 |
| GET | `/api/tilesets/:id/:z/:x/:y.pbf` | 获取瓦片 |

### 样式

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/styles` | 列出所有样式 |
| GET | `/api/styles/:id` | 获取样式 JSON |

### 搜索

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/search?q=北京&limit=10` | 正向搜索 |
| GET | `/api/search/reverse?lat=31.2&lon=121.4` | 反向查找 |
| GET | `/api/search/status` | 数据库状态 |

### 字体 / 符号库

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/fonts/{fontstack}/{range}.pbf` | 字形 |
| GET | `/api/sprites/{id}/sprite` | 符号库 |
| GET | `/api/assets/{file}` | 静态资源 |

## 地图风格

| 风格 | 文件 | 说明 |
|------|------|------|
| 标准 | `osm-bright.json` | OSM Bright，日常使用 |
| 原始版 | `osm-bright-raw.json` | 完整细节版 |
| 海军蓝 | `navy.json` | 深蓝指挥大屏 |
| 暗黑大屏 | `dark.json` | 深色科技感 |
| 卫星地球 | `satellite.json` | 大地色暖色调 |
| 赛博朋克 | `cyberpunk.json` | 紫黑霓虹风 |
| 极简灰底 | `minimal.json` | 简洁轻量 |

## Linux 开机自启（systemd）

```bash
sudo vim /etc/systemd/system/server-map.service
```

```ini
[Unit]
Description=Server Map — 离线地图服务
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/server-map
Environment=PORT=1234
ExecStart=/opt/server-map/server-map-linux
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

启用：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now server-map
sudo systemctl status server-map
sudo journalctl -u server-map -f     # 查看日志
```

## 瓦片数据获取

`.mbtiles` 文件需自行下载，放入 `data/tilesets/`：

- [OpenStreetMap](https://download.geofabrik.de/)
- [Maptiler Data](https://data.maptiler.com/downloads/planet/)

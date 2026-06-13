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

## 打包部署

```bash
pnpm dist    # 输出 dist/server-map-{win.exe,linux,macos}
```

> **重要**：由于 `sqlite3` 是原生模块，必须在**目标平台**上构建：
> - Windows exe → 在 Windows 上运行 `pnpm dist`
> - Linux 二进制 → 在 Linux（或 WSL）上运行 `pnpm dist`
> - macOS 二进制 → 在 macOS 上运行 `pnpm dist`
>
> 跨平台交叉编译会导致 `invalid ELF header` 错误。

部署结构（exe 放到任意位置即可，styles/fonts/sprites/public 已内置）：

```
部署目录/
├── server-map-win.exe          # Windows
│   （或 server-map-linux）     # Linux
├── config.json                 # 数据库连接配置（可选）
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
| PostGIS 扩展 | 安装时勾选 | `postgresql-<版本>-postgis-3` |
| hstore 扩展 | 安装时勾选 | 内置 |
| pg_trgm 扩展 | 自动创建 | `CREATE EXTENSION` |

> **版本匹配**：PostGIS 包名中的版本号必须与你的 PostgreSQL 一致。
> - PostgreSQL 16 → `apt install postgresql-16-postgis-3`
> - PostgreSQL 17 → `apt install postgresql-17-postgis-3`
> - 执行 `psql --version` 查看版本，去掉补丁号（如 17.0 → 17）

### 导出数据（从已有数据库）

```powershell
# Windows — 导出为纯 SQL（包含 placex + poi 两张表）
& "C:\Program Files\PostgreSQL\18\bin\pg_dump" `
  -U postgres -d nominatim `
  --table=placex `
  --table=poi `
  --format=plain `
  --no-owner `
  --file=data\export\nominatim_full.sql
```

> 导出文件 `data/export/nominatim_full.sql`（约 6.3GB），纯文本 SQL，任何 PostgreSQL 版本均可导入。

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
CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- 验证
SELECT extname FROM pg_extension;
-- 应输出: postgis, hstore, plpgsql, pg_trgm
\q
```

#### 3. 导入数据

**方式一：纯 SQL（推荐，兼容所有版本）**

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql" -U postgres -d nominatim -f "C:\path\to\nominatim_full.sql"
```

**方式二：custom 格式（仅 pg_restore ≥ 18）**

```powershell
& "C:\Program Files\PostgreSQL\18\bin\pg_restore" `
  -U postgres -d nominatim `
  --no-owner --no-privileges `
  "C:\path\to\nominatim_placex.dump"
```

导入时间约 10–20 分钟。首次导入时可能看到 `restrict` 或 `transaction_timeout` 警告，可忽略。

#### 4. 验证

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql" -U postgres -d nominatim -c "SELECT count(*) FROM placex;"
# 预期输出: 8697443
```

#### 5. 配置数据库连接

在 exe 同目录下创建 `config.json`（如果不存在，可使用默认值 localhost:5432）：

```json
{
  "postgres": {
    "host": "192.168.1.100",
    "port": 5432,
    "database": "nominatim",
    "user": "postgres",
    "password": "your_password"
  }
}
```

> **配置优先级**（从高到低）：
> 1. 环境变量 `PGHOST` / `PGDATABASE` / `PGUSER` / `PGPASSWORD` / `PGPORT`
> 2. exe 同目录下的 `config.json`
> 3. 内置默认值（localhost:5432 / postgres / postgres）

#### 6. 启动服务

启动 server-map 后验证搜索：

```
http://localhost:1234/api/search/status       → {"status":"OK","placex_count":8697443}
http://localhost:1234/api/search?q=上海       → [{"display_name":"上海市",...}]
```

---

### Linux 部署

#### 1. 安装 PostgreSQL + PostGIS

先确认 PostgreSQL 版本：

```bash
psql --version
# 例如：psql (PostgreSQL) 16.0 — 主版本号是 16
```

安装对应版本的 PostGIS（**包名中的版本号必须匹配**）：

```bash
# Ubuntu / Debian（以 16 为例）
sudo apt update
sudo apt install -y postgresql-16-postgis-3

# 其他版本：
# postgresql-14-postgis-3    PostgreSQL 14
# postgresql-15-postgis-3    PostgreSQL 15
# postgresql-16-postgis-3    PostgreSQL 16
# postgresql-17-postgis-3    PostgreSQL 17
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
CREATE EXTENSION IF NOT EXISTS pg_trgm;
SELECT extname FROM pg_extension;
EOF
```

预期输出：`postgis`, `hstore`, `plpgsql`, `pg_trgm`。

#### 3. 导入数据

**方式一：纯 SQL（推荐，兼容所有版本）**

```bash
# 上传 SQL 文件到服务器
scp data/export/nominatim_full.sql user@server:/tmp/

# 导入（约 20–40 分钟）
sudo -u postgres psql -d nominatim -f /tmp/nominatim_full.sql
```

首次导入时可能看到 `restrict` 或 `transaction_timeout` 警告（pg_dump 18 输出的指令老版本不认识），不影响数据，可忽略。

**方式二：custom 格式（仅 pg_restore ≥ 18）**

```bash
scp data/export/nominatim_placex.dump user@server:/tmp/
sudo -u postgres pg_restore -d nominatim --no-owner --no-privileges /tmp/nominatim_placex.dump
```

#### 4. 验证

```bash
sudo -u postgres psql -d nominatim -c "SELECT count(*) FROM placex;"
# 预期输出: 8697443
sudo -u postgres psql -d nominatim -c "SELECT count(*) FROM poi;"
# 预期输出: 148837 
```

#### 5. 配置数据库连接

在 exe 同目录下创建 `config.json`（参考 Windows 第 5 步），或通过 systemd 环境变量配置。

#### 6. 允许 TCP 连接（如需远程访问）

编辑 `pg_hba.conf`（路径如 `/etc/postgresql/16/main/pg_hba.conf`），添加：

```
# 允许本地 TCP 连接
host    nominatim    postgres    127.0.0.1/32    md5
```

然后重启：

```bash
sudo systemctl restart postgresql
```

#### 7. 启动服务 + 开机自启

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
Environment=PGHOST=localhost
Environment=PGPASSWORD=your_password
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

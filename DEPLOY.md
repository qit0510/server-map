# Server Map 部署文档

## 部署文件清单

| 文件 | 说明 | 必须 |
|------|------|------|
| `server-map-win.exe` / `server-map-linux` | 可执行文件 | ✅ |
| `config.json` | PostgreSQL 连接配置 | ✅ |
| `data/tilesets/china.mbtiles` | 矢量瓦片文件 | ✅ |

---

## Windows 部署

### 1. 准备目录

```powershell
mkdir D:\server-map\data\tilesets
```

### 2. 放入文件

```
D:\server-map\
├── server-map-win.exe
├── config.json
└── data\
    └── tilesets\
        └── china.mbtiles    ← 矢量瓦片（~20GB）
```

### 3. 配置数据库连接

编辑 `config.json`：

```json
{
  "postgres": {
    "host": "localhost",
    "port": 5432,
    "database": "nominatim",
    "user": "postgres",
    "password": "postgres"
  }
}
```

### 4. 启动

```powershell
cd D:\server-map
.\server-map-win.exe
```

服务启动在 `http://localhost:1234`。

### 5. 设为 Windows 服务（开机自启）

```powershell
# 安装 NSSM
choco install nssm

# 创建服务
nssm install ServerMap D:\server-map\server-map-win.exe
nssm set ServerMap AppDirectory D:\server-map
nssm set ServerMap DisplayName "Server Map"
nssm set ServerMap Start SERVICE_AUTO_START
nssm start ServerMap
```

---

## Linux 部署

### 1. 准备目录

```bash
sudo mkdir -p /opt/server-map/data/tilesets
```

### 2. 放入文件

```bash
# 上传文件
scp server-map-linux user@server:/tmp/
scp config.json user@server:/tmp/
scp china.mbtiles user@server:/tmp/

# 移动到目标目录
sudo mv /tmp/server-map-linux /opt/server-map/
sudo mv /tmp/config.json /opt/server-map/
sudo mv /tmp/china.mbtiles /opt/server-map/data/tilesets/

sudo chmod +x /opt/server-map/server-map-linux
```

最终结构：

```
/opt/server-map/
├── server-map-linux
├── config.json
└── data/
    └── tilesets/
        └── china.mbtiles
```

### 3. 配置数据库

编辑 `/opt/server-map/config.json`，同上。

### 4. 启动

```bash
cd /opt/server-map
./server-map-linux
```

服务启动在 `http://服务器IP:1234`。

### 5. 设为 systemd 服务（开机自启）

```bash
sudo tee /etc/systemd/system/server-map.service << 'EOF'
[Unit]
Description=Server Map
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/server-map
ExecStart=/opt/server-map/server-map-linux
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable server-map
sudo systemctl start server-map
```

### 管理命令

```bash
sudo systemctl status server-map   # 查看状态
sudo systemctl restart server-map  # 重启
sudo systemctl stop server-map     # 停止
sudo journalctl -u server-map -f   # 查看日志
```

---

## 验证部署

```bash
# 瓦片服务
curl http://localhost:1234/api/tilesets/china/tilejson

# 风格列表
curl http://localhost:1234/api/styles

# 搜索（需数据库）
curl "http://localhost:1234/api/search?q=北京"
```

---

## 更新瓦片

直接替换文件即可，无需重启：

```bash
cp new.mbtiles /opt/server-map/data/tilesets/china.mbtiles
```

---

## 防火墙

```bash
# Linux
sudo ufw allow 1234

# Windows
netsh advfirewall firewall add rule name="ServerMap" dir=in action=allow protocol=TCP localport=1234
```

# Server map 本地地图server



## 简介

> 1. 针对需求离线地图的server服务，使用node.js express启动地图服务
> 2. 本项目仅是地图服务，具体地图code，请参考index.html



## 快速开始

```
yarn        // 安装依赖
yarn start  // 启动服务
```


## 项目结构

主要的代码逻辑在 `app` 目录：

```
|-- app/
|   |-- services/                 // API服务目录
|   |   |-- styles/               // 地图样式服务
|   |   |   |-- index.js          // 地图样式服务入口，同时也定义了服务API的子路由
|   |   |   |-- controller.js     // 地图样式服务的Controller层，负责具体的业务过程
|   |   |-- tilesets/             // 地图瓦片服务
|   |   |-- sprites/              // 符号库服务
|   |   |-- fonts/                // 字体服务
|   |   |-- assets/               // 静态文件服务
|   |   |-- index.js              // 服务总路由
|   |-- index.js                  // 系统入口
|   |-- routes.js                 // 总路由
|-- bin/                          // 执行文件目录
|   |-- www                       // 系统启动脚本
|-- data/                         // 系统数据目录
|-- docs/                         // 文档目录
|-- test/                         // 测试文件
```



## 外部资源获取方式
>本项目不包含瓦片数据文件，文件过大已加入网盘，请自行下载
>瓦片资源可通通过一下资源获取 目录位置 data\tilesets

> OpenStreetMap: https://download.geofabrik.de/
> maptiler Data: https://data.maptiler.com/downloads/planet/


## 地图样式获取方式

> maptiler: https://www.maptiler.com/maps/
> mapbox: https://studio.mapbox.com/

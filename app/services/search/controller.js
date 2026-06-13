const { Pool } = require('pg')
const path = require('path')
const fs = require('fs')

/**
 * 配置加载优先级（从高到低）：
 *   1. 环境变量（PGHOST / PGDATABASE / PGUSER / PGPASSWORD / PGPORT）
 *   2. exe 同目录下的 config.json（部署时可修改，不用重新打包）
 *   3. 项目根目录下的 config.json（开发模式 / 内置模板）
 *   4. 硬编码默认值
 */
function loadDbConfig() {
  // 默认值
  const defaults = {
    host: 'localhost',
    port: 5432,
    database: 'nominatim',
    user: 'postgres',
    password: 'postgres'
  }

  // 尝试读取 config.json：先查 exe 目录（部署覆盖），再查项目目录（开发/内置）
  const searchDirs = []
  if (process.pkg) {
    searchDirs.push(path.dirname(process.execPath))           // 部署目录
    searchDirs.push(path.resolve(__dirname, '..', '..', '..')) // 快照内置
  } else {
    searchDirs.push(path.resolve(__dirname, '..', '..', '..')) // 开发模式
  }

  let fileConfig = {}
  for (const dir of searchDirs) {
    const p = path.join(dir, 'config.json')
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf-8')
        const cfg = JSON.parse(raw)
        if (cfg.postgres) fileConfig = cfg.postgres
        break
      }
    } catch (_) { /* 继续 */ }
  }

  // 合并：默认值 ← config.json ← 环境变量
  return {
    host: process.env.PGHOST || fileConfig.host || defaults.host,
    port: parseInt(process.env.PGPORT) || fileConfig.port || defaults.port,
    database: process.env.PGDATABASE || fileConfig.database || defaults.database,
    user: process.env.PGUSER || fileConfig.user || defaults.user,
    password: process.env.PGPASSWORD || fileConfig.password || defaults.password
  }
}

const dbConfig = loadDbConfig()

// PostgreSQL 连接池
const pool = new Pool({
  ...dbConfig,
  max: 5,
  idleTimeoutMillis: 30000
})

// 前缀搜索 — 用 B-tree 函数索引，极快（LIKE '北京%'）
const SQL_SEARCH_PREFIX = `
SELECT
  p.place_id, p.osm_type, p.osm_id, p.class, p.type,
  p.name, p.address,
  ST_X(p.centroid) AS lon, ST_Y(p.centroid) AS lat,
  p.importance, p.rank_search
FROM placex p
WHERE p.name ? 'name:zh'
  AND p.indexed_status = 0
  AND p.linked_place_id IS NULL
  AND (p.name -> 'name:zh') LIKE $1
ORDER BY p.rank_search ASC, p.importance DESC NULLS LAST
LIMIT $2 OFFSET $3
`

// 前缀搜索 + region 限制
const SQL_SEARCH_PREFIX_REGION = `
SELECT
  p.place_id, p.osm_type, p.osm_id, p.class, p.type,
  p.name, p.address,
  ST_X(p.centroid) AS lon, ST_Y(p.centroid) AS lat,
  p.importance, p.rank_search
FROM placex p
WHERE p.name ? 'name:zh'
  AND p.indexed_status = 0
  AND p.linked_place_id IS NULL
  AND (p.name -> 'name:zh') LIKE $1
  AND ST_DWithin(p.centroid, ST_SetSRID(ST_MakePoint($4, $5), 4326), 0.5)
ORDER BY p.rank_search ASC, p.importance DESC NULLS LAST
LIMIT $2 OFFSET $3
`

// 模糊搜索 — 子查询先过滤再排序
const SQL_SEARCH_FUZZY = `
SELECT * FROM (
  SELECT
    p.place_id, p.osm_type, p.osm_id, p.class, p.type,
    p.name, p.address,
    ST_X(p.centroid) AS lon, ST_Y(p.centroid) AS lat,
    p.importance, p.rank_search
  FROM placex p
  WHERE p.name ? 'name:zh'
    AND p.indexed_status = 0
    AND p.linked_place_id IS NULL
    AND (p.name -> 'name:zh') ILIKE $1
  LIMIT $2
) sub
ORDER BY rank_search ASC, importance DESC NULLS LAST
LIMIT $3 OFFSET $4
`

// 模糊搜索 + region
const SQL_SEARCH_FUZZY_REGION = `
SELECT * FROM (
  SELECT
    p.place_id, p.osm_type, p.osm_id, p.class, p.type,
    p.name, p.address,
    ST_X(p.centroid) AS lon, ST_Y(p.centroid) AS lat,
    p.importance, p.rank_search
  FROM placex p
  WHERE p.name ? 'name:zh'
    AND p.indexed_status = 0
    AND p.linked_place_id IS NULL
    AND (p.name -> 'name:zh') ILIKE $1
    AND ST_DWithin(p.centroid, ST_SetSRID(ST_MakePoint($5, $6), 4326), 0.5)
  LIMIT $2
) sub
ORDER BY rank_search ASC, importance DESC NULLS LAST
LIMIT $3 OFFSET $4
`

// 兜底搜索
const SQL_SEARCH_FALLBACK = `
SELECT * FROM (
  SELECT
    p.place_id, p.osm_type, p.osm_id, p.class, p.type,
    p.name, p.address,
    ST_X(p.centroid) AS lon, ST_Y(p.centroid) AS lat,
    p.importance, p.rank_search
  FROM placex p
  WHERE p.indexed_status = 0
    AND p.linked_place_id IS NULL
    AND (
      (p.name -> 'name:zh') ILIKE $1
      OR (p.name -> 'name') ILIKE $1
      OR (p.name -> 'ref') ILIKE $1
    )
  LIMIT $2
) sub
ORDER BY rank_search ASC, importance DESC NULLS LAST
LIMIT $3 OFFSET $4
`

// 兜底搜索 + region
const SQL_SEARCH_FALLBACK_REGION = `
SELECT * FROM (
  SELECT
    p.place_id, p.osm_type, p.osm_id, p.class, p.type,
    p.name, p.address,
    ST_X(p.centroid) AS lon, ST_Y(p.centroid) AS lat,
    p.importance, p.rank_search
  FROM placex p
  WHERE p.indexed_status = 0
    AND p.linked_place_id IS NULL
    AND (
      (p.name -> 'name:zh') ILIKE $1
      OR (p.name -> 'name') ILIKE $1
      OR (p.name -> 'ref') ILIKE $1
    )
    AND ST_DWithin(p.centroid, ST_SetSRID(ST_MakePoint($5, $6), 4326), 0.5)
  LIMIT $2
) sub
ORDER BY rank_search ASC, importance DESC NULLS LAST
LIMIT $3 OFFSET $4
`

// 反向地理编码：按坐标找最近地点
const SQL_REVERSE = `
SELECT
  p.place_id,
  p.osm_type,
  p.osm_id,
  p.class,
  p.type,
  p.name,
  p.address,
  ST_X(p.centroid) AS lon,
  ST_Y(p.centroid) AS lat,
  ST_Distance(p.centroid, ST_SetSRID(ST_MakePoint($1, $2), 4326)) AS distance,
  p.importance
FROM placex p
WHERE p.indexed_status = 0
  AND p.linked_place_id IS NULL
  AND p.rank_search <= 28
ORDER BY p.centroid <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)
LIMIT 1
`

// POI 商业数据兜底 — 水经微图导入的 POI 表（无 region）
const SQL_POI = `
SELECT id, name_zh, category, kind, address, lon, lat
FROM poi
WHERE name_zh LIKE $1
ORDER BY name_zh
LIMIT $2 OFFSET $3
`

// POI + region 空间过滤
const SQL_POI_REGION = `
SELECT p.id, p.name_zh, p.category, p.kind, p.address, p.lon, p.lat
FROM poi p
WHERE p.name_zh LIKE $1
  AND ST_DWithin(p.geom, ST_SetSRID(ST_MakePoint($2, $3), 4326), 0.5)
ORDER BY p.name_zh
LIMIT $4 OFFSET $5
`

// POI 地址搜索 — 关键词可能包含地名（如"南京西路星巴克"）
const SQL_POI_ADDR = `
SELECT id, name_zh, category, kind, address, lon, lat
FROM poi
WHERE name_zh LIKE $1 OR address LIKE $1
ORDER BY name_zh
LIMIT $2 OFFSET $3
`

/**
 * 从 hstore 格式的 name 字段提取可读名称
 */
function extractName(nameHstore) {
  if (!nameHstore) return ''
  const zh = nameHstore.match(/"name:zh"=>"([^"]*)"/)
  if (zh) return zh[1]
  const en = nameHstore.match(/"name"=>"([^"]*)"/)
  if (en) return en[1]
  return ''
}

/**
 * 格式化结果行
 */
function formatResult(row) {
  return {
    place_id: row.place_id,
    lon: String(row.lon),
    lat: String(row.lat),
    display_name: extractName(row.name),
    category: row.class,
    type: row.type,
    importance: row.importance ? parseFloat(row.importance) : 0,
    osm_type: row.osm_type,
    osm_id: row.osm_id
  }
}

function formatPoi(row) {
  const addr = row.address ? row.address.replace(/,$/, '') : ''
  const display = addr ? `${row.name_zh}（${addr}）` : row.name_zh
  return {
    place_id: 'poi_' + row.id,
    lon: String(row.lon),
    lat: String(row.lat),
    display_name: display,
    category: row.category,
    type: row.kind,
    importance: 0,
    osm_type: 'X',
    osm_id: 0
  }
}

/**
 * GET /api/search?q=北京&limit=10&offset=0
 *
 * 查询策略：
 *   1. 前缀匹配 LIKE '北京%' → B-tree 索引，1-10ms
 *   2. 前缀无结果 → 模糊匹配 ILIKE '%北京%' → GIN trigram 索引
 *   3. 仍无结果 → 兜底搜索 name/ref
 *   4. 仍无结果 → POI 商业数据兜底
 */
module.exports.search = async (req, res, next) => {
  const q = (req.query.q || '').trim()
  if (!q || q.length < 1) return res.json([])

  const limit = Math.min(parseInt(req.query.limit) || 10, 50)
  const offset = parseInt(req.query.offset) || 0
  const region = (req.query.region || '').trim()
  let regionLon = 0, regionLat = 0

  try {
    // 预解析 region → 质心坐标（只查一次，不重复子查询）
    if (region) {
      const r = await pool.query(
        `SELECT ST_X(centroid) AS lon, ST_Y(centroid) AS lat FROM placex
         WHERE name ? 'name:zh' AND indexed_status = 0 AND linked_place_id IS NULL
           AND class = 'boundary' AND type = 'administrative'
           AND (name -> 'name:zh') ILIKE $1
         ORDER BY rank_search LIMIT 1`,
        [`%${region}%`]
      )
      if (r.rows.length > 0) {
        regionLon = r.rows[0].lon
        regionLat = r.rows[0].lat
      }
    }

    const fuzzyLimit = Math.min(limit * 10, 500)

    // 1. 前缀匹配（B-tree，极快）
    let result
    if (region) {
      result = await pool.query(SQL_SEARCH_PREFIX_REGION, [`${q}%`, limit, offset, regionLon, regionLat])
    } else {
      result = await pool.query(SQL_SEARCH_PREFIX, [`${q}%`, limit, offset])
    }

    // 2. 前缀无结果 → 模糊匹配（子查询过滤 → 外层排序）
    if (result.rows.length === 0) {
      if (region) {
        result = await pool.query(SQL_SEARCH_FUZZY_REGION, [`%${q}%`, fuzzyLimit, limit, offset, regionLon, regionLat])
      } else {
        result = await pool.query(SQL_SEARCH_FUZZY, [`%${q}%`, fuzzyLimit, limit, offset])
      }
    }

    // 3. 仍无结果 → 兜底搜索 name/ref
    if (result.rows.length === 0 && q.length >= 2) {
      if (region) {
        result = await pool.query(SQL_SEARCH_FALLBACK_REGION, [`%${q}%`, fuzzyLimit, limit, offset, regionLon, regionLat])
      } else {
        result = await pool.query(SQL_SEARCH_FALLBACK, [`%${q}%`, fuzzyLimit, limit, offset])
      }
    }

    // 4-5. 仍无结果 → POI 搜索（按名称 + 按地址联合）
    const poiList = []
    if (result.rows.length === 0) {
      // POI 按名称
      let poiResult
      if (region) {
        poiResult = await pool.query(SQL_POI_REGION, [`%${q}%`, regionLon, regionLat, limit, offset])
      } else {
        poiResult = await pool.query(SQL_POI, [`%${q}%`, limit, offset])
      }
      if (poiResult.rows.length > 0) {
        poiList.push(...poiResult.rows.map(formatPoi))
      } else {
        // POI 按地址+名称
        const addrResult = await pool.query(SQL_POI_ADDR, [`%${q}%`, limit, offset])
        if (addrResult.rows.length > 0) {
          poiList.push(...addrResult.rows.map(formatPoi))
        }
      }
    }

    // 始终提取 POI 补充 placex 结果（带地址的星巴克等）
    const poiExtra = await pool.query(SQL_POI, [`%${q}%`, 3, 0])
    const extraList = poiExtra.rows.map(formatPoi)
    const existingNames = new Set(result.rows.map(r => formatResult(r).display_name.slice(0, 6)))
    for (const p of extraList) {
      if (!existingNames.has(p.display_name.slice(0, 6))) {
        poiList.unshift(p)  // POI 置顶
      }
    }

    if (poiList.length > 0) {
      const merged = [...poiList, ...result.rows.map(formatResult)].slice(0, limit)
      return res.json(merged)
    }

    res.json(result.rows.map(formatResult))
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/search/reverse?lat=39.9&lon=116.4
 */
module.exports.reverse = async (req, res, next) => {
  const lat = parseFloat(req.query.lat)
  const lon = parseFloat(req.query.lon)

  if (isNaN(lat) || isNaN(lon)) {
    return res.status(400).json({ error: '需要 lat 和 lon 参数' })
  }

  try {
    const result = await pool.query(SQL_REVERSE, [lon, lat])
    if (result.rows.length === 0) return res.json(null)

    const row = result.rows[0]
    res.json({
      ...formatResult(row),
      distance: parseFloat(row.distance)
    })
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/search/status
 */
module.exports.status = async (req, res, next) => {
  try {
    const result = await pool.query('SELECT count(*) AS cnt FROM placex')
    res.json({ status: 'OK', placex_count: parseInt(result.rows[0].cnt) })
  } catch (err) {
    res.json({ status: 'ERROR', message: err.message })
  }
}

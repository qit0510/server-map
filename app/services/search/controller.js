const { Pool } = require('pg')

// PostgreSQL 连接池
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'nominatim',
  user: 'postgres',
  password: 'postgres',
  max: 5,
  idleTimeoutMillis: 30000
})

// 中文优先搜索
const SQL_SEARCH = `
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
  p.importance,
  p.rank_search
FROM placex p
WHERE p.name ? 'name:zh'
  AND p.indexed_status = 0
  AND p.linked_place_id IS NULL
  AND (p.name -> 'name:zh') ILIKE $1
ORDER BY p.rank_search ASC, p.importance DESC NULLS LAST
LIMIT $2
OFFSET $3
`

// 兜底搜索（中文无结果时回退到任意名称）
const SQL_SEARCH_FALLBACK = `
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
  p.importance,
  p.rank_search
FROM placex p
WHERE p.indexed_status = 0
  AND p.linked_place_id IS NULL
  AND (COALESCE(p.name -> 'name:zh', p.name -> 'name', p.name -> 'ref')) ILIKE $1
ORDER BY p.rank_search ASC, p.importance DESC NULLS LAST
LIMIT $2
OFFSET $3
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

/**
 * GET /api/search?q=北京&limit=10&offset=0
 */
module.exports.search = async (req, res, next) => {
  const q = (req.query.q || '').trim()
  if (!q || q.length < 1) return res.json([])

  const limit = Math.min(parseInt(req.query.limit) || 10, 50)
  const offset = parseInt(req.query.offset) || 0
  const like = `%${q}%`

  try {
    // 先按中文搜索
    let result = await pool.query(SQL_SEARCH, [like, limit, offset])

    // 中文无结果时兜底
    if (result.rows.length === 0 && q.length >= 2) {
      result = await pool.query(SQL_SEARCH_FALLBACK, [like, limit, offset])
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

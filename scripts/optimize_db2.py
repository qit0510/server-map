import psycopg

conn = psycopg.connect('dbname=nominatim user=postgres password=postgres')
conn.autocommit = True

# ============================================================
# 第一步：提取 name_zh 为独立列，避免每次查询都解析 hstore
# ============================================================
print('1. 添加 name_zh 列...')
try:
    conn.execute('ALTER TABLE placex ADD COLUMN name_zh text')
    conn.execute("""
    UPDATE placex SET name_zh = name -> 'name:zh'
    WHERE name ? 'name:zh' AND indexed_status = 0 AND linked_place_id IS NULL
    """)
    print('   name_zh 列已填充')
except Exception as e:
    print(f'   (列可能已存在: {e})')

# ============================================================
# 第二步：B-tree 前缀索引（LIKE '北京%'）— 2 字以上命中
# ============================================================
print('2. 创建 B-tree 前缀索引...')
conn.execute("""
CREATE INDEX IF NOT EXISTS idx_placex_name_zh_btree
ON placex (name_zh varchar_pattern_ops)
WHERE name_zh IS NOT NULL AND indexed_status = 0 AND linked_place_id IS NULL
""")
print('   idx_placex_name_zh_btree 完成')

# ============================================================
# 第三步：pg_trgm GIN 索引（ILIKE '%keyword%' 兜底）
# ============================================================
print('3. 重建 trigram GIN 索引到 name_zh 列...')
conn.execute('DROP INDEX IF EXISTS idx_placex_name_zh_trgm')
conn.execute("""
CREATE INDEX CONCURRENTLY idx_placex_name_zh_trgm
ON placex USING gin (name_zh gin_trgm_ops)
WHERE name_zh IS NOT NULL AND indexed_status = 0 AND linked_place_id IS NULL
""")
print('   idx_placex_name_zh_trgm 完成')

print()
print('=== 全部索引 ===')
for row in conn.execute("SELECT indexname FROM pg_indexes WHERE tablename='placex' AND indexname LIKE '%name_zh%' ORDER BY indexname").fetchall():
    print(f'  {row[0]}')

conn.close()
print('\n优化完成')

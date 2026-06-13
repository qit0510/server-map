import psycopg, time

conn = psycopg.connect('dbname=nominatim user=postgres password=postgres')
conn.autocommit = True

# 1. 强制杀 UPDATE
conn.execute("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE query LIKE '%UPDATE placex SET name_zh%' AND pid <> pg_backend_pid()")
time.sleep(2)
running = conn.execute("SELECT count(*) FROM pg_stat_activity WHERE query LIKE '%UPDATE placex SET name_zh%'").fetchone()[0]
print(f'1. 残留 UPDATE: {running}')

# 2. 函数索引：直接索引 (name -> 'name:zh') 表达式，免物理列
print('2. 创建 B-tree 前缀索引...')
conn.execute("""
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_placex_name_zh_prefix
ON placex ((name -> 'name:zh') varchar_pattern_ops)
WHERE name ? 'name:zh' AND indexed_status = 0 AND linked_place_id IS NULL
""")
print('   idx_placex_name_zh_prefix OK')

# 3. GIN trigram
print('3. 重建 GIN trigram 索引...')
conn.execute("DROP INDEX IF EXISTS idx_placex_name_zh_trgm")
conn.execute("""
CREATE INDEX CONCURRENTLY idx_placex_name_zh_trgm
ON placex USING gin ((name -> 'name:zh') gin_trgm_ops)
WHERE name ? 'name:zh' AND indexed_status = 0 AND linked_place_id IS NULL
""")
print('   idx_placex_name_zh_trgm OK')

print()
print('=== 索引列表 ===')
for row in conn.execute("SELECT indexname FROM pg_indexes WHERE tablename='placex' AND (indexname LIKE '%name_zh%' OR indexname LIKE '%zh_%') ORDER BY indexname").fetchall():
    print(f'  {row[0]}')
conn.close()
print('done')

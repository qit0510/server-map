import psycopg
import sys

conn = psycopg.connect('dbname=nominatim user=postgres password=postgres')
conn.autocommit = True

# 1. pg_trgm 扩展
conn.execute('CREATE EXTENSION IF NOT EXISTS pg_trgm')
print('1. pg_trgm 扩展已启用')

# 2. 检查索引是否存在
rows = conn.execute("SELECT 1 FROM pg_indexes WHERE indexname = 'idx_placex_name_zh_trgm'").fetchall()
if rows:
    print('2. 索引已存在，跳过')
else:
    print('2. 开始创建 trigram GIN 索引（后台运行，不锁表，约 5-10 分钟）...')
    conn.execute("""
    CREATE INDEX CONCURRENTLY idx_placex_name_zh_trgm
    ON placex USING gin ((name -> 'name:zh') gin_trgm_ops)
    WHERE indexed_status = 0 AND linked_place_id IS NULL
    """)
    print('3. 索引创建完成！')

# 验证
print()
print('=== 索引列表（placex 相关）===')
rows = conn.execute("""
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'placex' AND indexname LIKE '%trgm%'
""").fetchall()
for name, defn in rows:
    print(f'  {name}')

conn.close()
print()
print('done')

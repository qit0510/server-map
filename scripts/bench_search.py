import psycopg, time

conn = psycopg.connect('dbname=nominatim user=postgres password=postgres')

tests = ['北京', '上海', '徐家汇', '乌鲁木齐']

print(f"{'关键词':<10} {'耗时':>8} {'结果数':>6}")
print("-" * 30)

for kw in tests:
    start = time.time()
    rows = conn.execute("""
        SELECT p.place_id, p.name, ST_X(p.centroid) AS lon, ST_Y(p.centroid) AS lat
        FROM placex p
        WHERE p.name ? 'name:zh'
          AND p.indexed_status = 0
          AND p.linked_place_id IS NULL
          AND (p.name -> 'name:zh') ILIKE %(q)s
        ORDER BY p.rank_search ASC, p.importance DESC NULLS LAST
        LIMIT 10
    """, {'q': '%' + kw + '%'}).fetchall()
    elapsed = (time.time() - start) * 1000
    
    # 取第一条结果的地名
    name = ''
    if rows:
        m = __import__('re').search(r'"name:zh"=>"([^"]*)"', rows[0][1] or '')
        if m:
            name = m.group(1)
    
    print(f"{kw:<10} {elapsed:>6.0f}ms {len(rows):>6}条  → {name}")

conn.close()

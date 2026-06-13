"""
水经微图 SHP → PostgreSQL poi 表 导入脚本
用法: python import_poi.py
"""
import shapefile
import psycopg
import glob, os, sys

SRC_DIR = r"D:\dd\上海市poi"
DB_DSN = "dbname=nominatim user=postgres password=postgres"
BATCH_SIZE = 2000

def main():
    shp_files = sorted(glob.glob(os.path.join(SRC_DIR, "*.shp")))
    total = 0
    conn = psycopg.connect(DB_DSN)

    for shp in shp_files:
        name = os.path.basename(shp).replace("上海市poi_", "").replace(".shp", "")
        if name in ("下载范围", "百度建筑"):  # 跳过非POI数据
            continue

        print(f"导入 {name}...", end=" ", flush=True)
        try:
            sf = shapefile.Reader(shp, encoding="gbk")
        except Exception as e:
            print(f"跳过 (无法读取: {e})")
            continue

        fields = [f[0].lower() for f in sf.fields[1:]]
        batch = []
        count = 0

        for sr in sf.iterShapeRecords():
            rec = sr.record
            pt = sr.shape.points[0]
            lon, lat = pt[0], pt[1]

            # 跳过无效坐标
            if not (-180 <= lon <= 180 and -90 <= lat <= 90):
                continue

            vals = dict(zip(fields, rec))
            name_zh = str(vals.get("name", "")).strip()
            if not name_zh:
                continue

            batch.append((
                name_zh,
                str(vals.get("pyname", "")).strip(),
                name,  # 文件名为 category
                str(vals.get("kind", "")).strip(),
                str(vals.get("telephone", "")).strip(),
                str(vals.get("address", "")).strip(),
                lon,
                lat,
            ))

            if len(batch) >= BATCH_SIZE:
                insert_batch(conn, batch)
                count += len(batch)
                batch = []

        if batch:
            insert_batch(conn, batch)
            count += len(batch)

        sf.close()
        total += count
        print(f"{count} 条")

    conn.commit()
    conn.close()
    print(f"\n总计导入: {total} 条")

def insert_batch(conn, rows):
    with conn.cursor() as cur:
        cur.executemany(
            """INSERT INTO poi (name_zh, name_py, category, kind, telephone, address, lon, lat, geom, source)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s,
                       ST_SetSRID(ST_MakePoint(%s, %s), 4326), 'shuijingweitu')
               ON CONFLICT DO NOTHING""",
            [(r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[6], r[7]) for r in rows]
        )
        conn.commit()

if __name__ == "__main__":
    main()

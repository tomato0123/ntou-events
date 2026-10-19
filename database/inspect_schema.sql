-- 在 pgAdmin 選取 ntou_events 後執行整份檔案。
-- 唯讀查詢：不新增、修改或刪除資料。
-- 全部結果集中在同一張結果表，方便複製或匯出。
WITH inspection AS (
    SELECT
        '1. 欄位'::text AS section,
        table_name::text AS table_name,
        column_name::text AS item,
        concat(
            '型別=', data_type,
            '; 長度=', COALESCE(character_maximum_length::text, '不適用'),
            '; 允許NULL=', is_nullable,
            '; 預設值=', COALESCE(column_default, '無'),
            '; 自動編號=', is_identity,
            '; 編號模式=', COALESCE(identity_generation, '不適用')
        ) AS definition
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('users', 'events', 'registrations')

    UNION ALL

    SELECT
        '2. 限制',
        t.relname::text,
        c.conname::text,
        concat(
            pg_get_constraintdef(c.oid, true),
            '; 已驗證既有資料=', c.convalidated::text
        )
    FROM pg_constraint AS c
    JOIN pg_class AS t ON t.oid = c.conrelid
    JOIN pg_namespace AS n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname IN ('users', 'events', 'registrations')

    UNION ALL

    SELECT
        '3. 索引',
        t.relname::text,
        i.relname::text,
        concat(
            pg_get_indexdef(i.oid),
            '; 索引有效=', x.indisvalid::text
        )
    FROM pg_index AS x
    JOIN pg_class AS t ON t.oid = x.indrelid
    JOIN pg_class AS i ON i.oid = x.indexrelid
    JOIN pg_namespace AS n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname IN ('users', 'events', 'registrations')
)
SELECT
    current_database() AS "資料庫",
    section AS "類別",
    table_name AS "資料表",
    item AS "欄位或規則名稱",
    definition AS "實際設定"
FROM inspection
ORDER BY section, table_name, item;

-- 海大活動報名系統：events 新增報名期間與公開狀態 (US-07 / UI-05)
-- 依據：資料庫結構文件 2026-11-06「報名期間與公開狀態：同步設計」
--
-- 適用：已依舊版 schema.sql 建立 events 表的資料庫。
-- 新建資料庫請直接執行 schema.sql，不需要執行本檔。
--
-- 執行前請先備份資料庫。
-- 依文件規定，既有活動「不得自動公開或捏造期間」：
--   第一步只新增欄位（期間允許 NULL、is_published 預設 false），
--   由活動負責人補齊每筆既有活動的報名期間後，再執行第二步。

-- ===== 第一步：新增欄位與時間順序 CHECK =====
BEGIN;

ALTER TABLE public.events
    ADD COLUMN registration_opens_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN registration_closes_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN is_published BOOLEAN NOT NULL DEFAULT false;

-- 欄位為 NULL 時 CHECK 視為通過，因此可先建立
ALTER TABLE public.events
    ADD CONSTRAINT events_registration_period_valid
        CHECK (registration_opens_at < registration_closes_at),
    ADD CONSTRAINT events_registration_before_start
        CHECK (registration_closes_at <= starts_at);

COMMIT;

-- ===== 第二步：既有資料補齊後再執行 =====
-- 先確認沒有缺少期間的活動（結果應為 0 筆）：
--   SELECT id, title FROM public.events
--   WHERE registration_opens_at IS NULL OR registration_closes_at IS NULL;
--
-- BEGIN;
-- ALTER TABLE public.events
--     ALTER COLUMN registration_opens_at SET NOT NULL,
--     ALTER COLUMN registration_closes_at SET NOT NULL;
-- COMMIT;

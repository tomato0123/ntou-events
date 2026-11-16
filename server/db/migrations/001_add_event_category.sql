-- 001_add_event_category.sql
-- 為既有的 events 資料表新增 category（活動分類）欄位。
-- 可重複執行：已升級過的資料庫再跑一次不會出錯。
--
-- 執行方式：
--   psql -h localhost -U postgres -d ntou_events -f db/migrations/001_add_event_category.sql
--
-- 允許值（與 server.js 的 CATEGORIES、docs/event-category-spec.md 必須一致）：
--   lecture = 講座、club = 社團、sports = 體育、other = 其他

BEGIN;

-- 1. 新增欄位（先允許 NULL，才能處理既有資料）
ALTER TABLE events ADD COLUMN IF NOT EXISTS category VARCHAR(20);

-- 2. 既有活動沒有分類，一律先歸為「其他」，之後再由主辦人逐筆修正
UPDATE events SET category = 'other' WHERE category IS NULL;

-- 3. 之後每筆活動都必須有分類
--    （刻意不設 DEFAULT：新增活動時沒給分類就應該失敗，而不是默默變成「其他」）
ALTER TABLE events ALTER COLUMN category SET NOT NULL;

-- 4. 限制允許值（先刪再建，方便日後修改允許值時重跑）
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_category_check;
ALTER TABLE events
  ADD CONSTRAINT events_category_check
  CHECK (category IN ('lecture', 'club', 'sports', 'other'));

-- 5. 依分類篩選並依時間排序時使用的索引
CREATE INDEX IF NOT EXISTS idx_events_category_starts_at
  ON events (category, starts_at, id);

COMMIT;

-- 回復（rollback）用，必要時手動執行：
-- BEGIN;
-- DROP INDEX IF EXISTS idx_events_category_starts_at;
-- ALTER TABLE events DROP CONSTRAINT IF EXISTS events_category_check;
-- ALTER TABLE events DROP COLUMN IF EXISTS category;
-- COMMIT;

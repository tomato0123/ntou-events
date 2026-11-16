-- 唯讀核對：不回傳使用者或報名個資，不修改資料。
BEGIN READ ONLY;

SELECT current_database() AS database_name;

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'events'
  AND column_name = 'manager_id';

SELECT c.conname, c.contype, c.convalidated,
       pg_get_constraintdef(c.oid) AS definition,
       c.confdeltype AS delete_action, c.confupdtype AS update_action
FROM pg_constraint c
WHERE c.conrelid = to_regclass('public.events')
  AND c.conname = 'events_manager_id_fkey';
-- 預期 FOREIGN KEY (manager_id) REFERENCES users(id)，delete/update_action = a (NO ACTION)。
-- 若欄位或外鍵不存在，對應查詢回傳零列；若定義不符，停止遷移並由團隊檢查。

COMMIT;

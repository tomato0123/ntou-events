-- 既有資料庫升級：只新增欄位與外鍵，不推定舊活動負責人。
-- 舊活動 manager_id 保持 NULL，待團隊逐筆確認；期間僅 admin 可查名單。
BEGIN;

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS manager_id INTEGER;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.events'::regclass
          AND conname = 'events_manager_id_fkey'
    ) THEN
        ALTER TABLE public.events
            ADD CONSTRAINT events_manager_id_fkey
            FOREIGN KEY (manager_id) REFERENCES public.users (id);
    END IF;
END
$$;

COMMIT;

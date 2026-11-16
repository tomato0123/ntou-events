-- 既有資料庫升級：防止同一使用者重複有效報名同一活動。
-- 執行前請先備份。若已有重複資料，腳本會停止且不會刪除資料。
BEGIN;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.registrations
        WHERE status = 'registered'
        GROUP BY user_id, event_id
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION
            'registrations 存在重複有效報名，請先處理後再建立 registrations_one_active';
    END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS registrations_one_active
    ON public.registrations (user_id, event_id)
    WHERE status = 'registered';

COMMIT;

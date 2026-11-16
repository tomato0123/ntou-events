-- 僅供已建立 registrations 資料表的既有資料庫執行。
-- 若目前已有重複的有效報名，先停止並列出衝突資料，避免任意刪除歷程。
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

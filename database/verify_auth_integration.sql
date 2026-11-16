-- 唯讀驗證，於 migration 後執行；沒有新增、更新或刪除資料。
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public'
 AND ((table_name='users' AND column_name IN ('email','email_verified_at'))
   OR (table_name='events' AND column_name='manager_id')
   OR table_name IN ('email_verification_tokens','email_verification_deliveries','email_verification_sources'))
ORDER BY table_name, ordinal_position;
SELECT tablename,indexname,indexdef FROM pg_indexes
WHERE schemaname='public' AND indexname IN ('users_email_normalized_unique','registrations_one_active');
SELECT conrelid::regclass AS table_name,conname,pg_get_constraintdef(oid) AS definition
FROM pg_constraint WHERE conrelid IN ('public.events'::regclass,'public.email_verification_tokens'::regclass,'public.email_verification_deliveries'::regclass)
 AND contype='f';
SELECT count(*) AS normalized_email_collision_groups
FROM (SELECT lower(trim(email)) FROM public.users GROUP BY lower(trim(email)) HAVING count(*)>1) AS collisions;
SELECT count(*) AS active_registration_collision_groups
FROM (SELECT user_id,event_id FROM public.registrations WHERE status='registered' GROUP BY user_id,event_id HAVING count(*)>1) AS collisions;

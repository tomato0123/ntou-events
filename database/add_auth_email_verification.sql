BEGIN;
-- 先盤點大小寫／前後空白碰撞；碰撞時中止，不合併或刪除帳號。
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM public.users GROUP BY lower(trim(email)) HAVING count(*)>1) THEN
  RAISE EXCEPTION 'Email 正規化有重複，請先由小組人工處理';
 END IF;
END $$;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_normalized_unique ON public.users(lower(trim(email)));
CREATE TABLE IF NOT EXISTS public.email_verification_tokens (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 user_id INTEGER NOT NULL REFERENCES public.users(id),
 token_hash CHAR(64) NOT NULL UNIQUE,
 expires_at TIMESTAMPTZ NOT NULL,
 used_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS public.email_verification_deliveries (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 user_id INTEGER NOT NULL REFERENCES public.users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS email_deliveries_user_time ON public.email_verification_deliveries(user_id,created_at);
CREATE TABLE IF NOT EXISTS public.email_verification_sources (
 source_hash CHAR(64) PRIMARY KEY,
 window_start TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 attempts INTEGER NOT NULL DEFAULT 0
);
COMMIT;

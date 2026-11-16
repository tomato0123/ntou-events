-- 海大活動報名系統：初始資料表
-- 使用方式：
-- 1. 先建立一個空白的 ntou_events 資料庫。
-- 2. 在該資料庫中執行本檔案。
-- 本檔案只建立結構，不包含使用者、活動或報名資料。
-- 已有同名資料表的資料庫請勿重複執行。

BEGIN;

-- 使用者
CREATE TABLE public.users (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100),
    role VARCHAR(20) NOT NULL DEFAULT 'user',
    campus_identity VARCHAR(20),
    gender VARCHAR(20),
    email VARCHAR(100) NOT NULL,
    password_hash TEXT,

    CONSTRAINT users_email_unique UNIQUE (email),
    CONSTRAINT users_role_check
        CHECK (role IN ('user', 'event_manager', 'admin')),
    CONSTRAINT users_campus_identity_check
        CHECK (campus_identity IN ('student', 'teacher', 'staff'))
);

-- 活動
CREATE TABLE public.events (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    location VARCHAR(200) NOT NULL,
    starts_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT events_time_valid
        CHECK (ends_at > starts_at)
);

-- 報名紀錄
CREATE TABLE public.registrations (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id INTEGER NOT NULL,
    event_id INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'registered',
    registered_at TIMESTAMP WITH TIME ZONE NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT registrations_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users (id),
    CONSTRAINT registrations_event_id_fkey
        FOREIGN KEY (event_id) REFERENCES public.events (id),
    CONSTRAINT registrations_status_check
        CHECK (status IN ('registered', 'cancelled'))
);

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

CREATE UNIQUE INDEX registrations_one_active ON public.registrations(user_id,event_id) WHERE status='registered';
COMMIT;
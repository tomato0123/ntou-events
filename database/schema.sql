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
    -- 舊資料遷移期間允許 NULL；新活動由後端填入登入建立者。
    manager_id INTEGER,
    starts_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
    registration_opens_at TIMESTAMP WITH TIME ZONE NOT NULL,
    registration_closes_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_published BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT events_manager_id_fkey
        FOREIGN KEY (manager_id) REFERENCES public.users (id),
    CONSTRAINT events_time_valid
        CHECK (ends_at > starts_at),
    CONSTRAINT events_registration_period_valid
        CHECK (registration_opens_at < registration_closes_at),
    CONSTRAINT events_registration_before_start
        CHECK (registration_closes_at <= starts_at)
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

COMMIT;

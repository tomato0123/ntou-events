-- 海大活動報名系統 資料表建置腳本 (PostgreSQL)
-- 適用於 pgAdmin 或 psql 執行

-- 1. 使用者資料表 (users)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'user', -- 'user', 'event_manager', 'admin'
    campus_identity VARCHAR(50) NOT NULL,     -- '學生', '教職員', '校友'
    gender VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 活動資料表 (events)
CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    location VARCHAR(255) NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 報名紀錄資料表 (registrations)
CREATE TABLE IF NOT EXISTS registrations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'registered', -- 'registered', 'cancelled'
    registered_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_user_event_registration UNIQUE (user_id, event_id)
);

-- 建立索引加速查詢
CREATE INDEX IF NOT EXISTS idx_events_starts_at ON events(starts_at);
CREATE INDEX IF NOT EXISTS idx_registrations_user_id ON registrations(user_id);
CREATE INDEX IF NOT EXISTS idx_registrations_event_id ON registrations(event_id);

-- 初始測試資料 (種子資料)
INSERT INTO users (name, email, password_hash, role, campus_identity, gender)
VALUES
('系統管理員', 'admin@campus.edu.tw', 'dummy_hash', 'admin', '教職員', '男'),
('活動主辦者', 'manager@campus.edu.tw', 'dummy_hash', 'event_manager', '教職員', '女'),
('王小明', 'ming@campus.edu.tw', 'dummy_hash', 'user', '學生', '男')
ON CONFLICT (email) DO NOTHING;

INSERT INTO events (title, description, location, starts_at, ends_at)
VALUES
('校園春季音樂祭', '一年一度的草地音樂節，歡迎全校師生參與。', '大禮堂前廣場', '2026-11-20T18:00:00Z', '2026-11-20T21:30:00Z'),
('AI 實戰工作坊', '帶你從零打造校園聊天機器人。', '資訊大樓 302 教室', '2026-12-01T13:30:00Z', '2026-12-01T16:30:00Z')
ON CONFLICT DO NOTHING;


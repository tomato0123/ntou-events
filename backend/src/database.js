import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

export function openDatabase(filename = './data/events.sqlite') {
  if (filename !== ':memory:') mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      student_id TEXT NOT NULL COLLATE NOCASE UNIQUE,
      email TEXT NOT NULL COLLATE NOCASE UNIQUE,
      department TEXT NOT NULL,
      identity TEXT NOT NULL CHECK(identity IN ('student', 'faculty', 'staff')),
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      location TEXT NOT NULL,
      organizer TEXT NOT NULL,
      starts_at INTEGER NOT NULL,
      ends_at INTEGER NOT NULL,
      registration_opens_at INTEGER NOT NULL,
      registration_closes_at INTEGER NOT NULL,
      capacity INTEGER NOT NULL CHECK(capacity > 0),
      allow_waitlist INTEGER NOT NULL DEFAULT 0 CHECK(allow_waitlist IN (0, 1)),
      status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('draft', 'published', 'cancelled')),
      CHECK(ends_at > starts_at),
      CHECK(registration_opens_at < registration_closes_at),
      CHECK(registration_closes_at <= starts_at)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS registrations (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      code TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL REFERENCES users(id),
      event_id TEXT NOT NULL REFERENCES events(id),
      status TEXT NOT NULL CHECK(status IN ('confirmed', 'waitlisted', 'cancelled')),
      created_at INTEGER NOT NULL,
      cancelled_at INTEGER,
      promoted_at INTEGER,
      CHECK((status = 'cancelled' AND cancelled_at IS NOT NULL) OR (status <> 'cancelled' AND cancelled_at IS NULL))
    ) STRICT;
    CREATE UNIQUE INDEX IF NOT EXISTS one_active_registration
      ON registrations(event_id, user_id) WHERE status IN ('confirmed', 'waitlisted');
    CREATE INDEX IF NOT EXISTS registration_queue ON registrations(event_id, status, sequence);
    CREATE INDEX IF NOT EXISTS registration_owner ON registrations(user_id, sequence DESC);
  `);
  return db;
}

// 回呼必須是同步操作，讓名額計算與寫入在同一個交易內完成。
export function transaction(db, callback) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = callback();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

// 僅新增不存在的示範活動，不刪除或改寫既有資料。
export function seedDatabase(db, now = Date.now()) {
  const day = 86_400_000;
  const samples = [
    ['ocean-workshop', '海洋永續設計工作坊', '透過設計思考與分組實作，探索海洋永續提案。', '工作坊', '圖書館 2F 多功能展演廳', '永續發展中心', 10, 2, 1],
    ['career-talk', '職涯探索講座', '邀請校友分享職涯選擇與國際工作經驗。', '講座', '行政大樓第一演講廳', '職涯發展組', 15, 1, 0],
    ['coastal-walk', '海岸生態觀察', '認識潮間帶生物，學習友善海洋的觀察方式。', '戶外體驗', '校門口集合', '海洋生物研究所', 20, 30, 1],
  ];
  return transaction(db, () => {
    const insert = db.prepare(`INSERT OR IGNORE INTO events
      (id, title, description, category, location, organizer, starts_at, ends_at,
       registration_opens_at, registration_closes_at, capacity, allow_waitlist)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    let added = 0;
    for (const [id, title, description, category, location, organizer, offset, capacity, waitlist] of samples) {
      const startsAt = now + offset * day;
      added += Number(insert.run(id, title, description, category, location, organizer,
        startsAt, startsAt + 3 * 3_600_000, now - day, startsAt - day, capacity, waitlist).changes);
    }
    return added;
  });
}

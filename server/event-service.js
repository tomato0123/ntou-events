const { Pool } = require('pg');

const pool = new Pool({
  connectionTimeoutMillis: 5000
});

// 記憶體儲存庫 (當未連線資料庫或在測試環境時提供備用)
const mockEvents = [];
let mockIdCounter = 101;

/**
 * 驗證活動資料欄位與時間設定
 * @param {object} data
 * @returns {object} 清理與標準化後的資料
 */
function validateEventData(data) {
  if (!data || typeof data !== 'object') {
    const error = new Error('活動資料不得為空');
    error.statusCode = 400;
    throw error;
  }

  const {
    title,
    description,
    location,
    starts_at,
    ends_at,
    registration_starts_at,
    registration_ends_at
  } = data;

  // 1. 必填欄位檢查
  if (!title || typeof title !== 'string' || title.trim() === '') {
    const error = new Error('活動名稱 (title) 為必填欄位且不可為空');
    error.statusCode = 400;
    throw error;
  }

  if (!description || typeof description !== 'string' || description.trim() === '') {
    const error = new Error('活動說明 (description) 為必填欄位且不可為空');
    error.statusCode = 400;
    throw error;
  }

  if (!location || typeof location !== 'string' || location.trim() === '') {
    const error = new Error('活動地點 (location) 為必填欄位且不可為空');
    error.statusCode = 400;
    throw error;
  }

  if (!starts_at) {
    const error = new Error('活動開始時間 (starts_at) 為必填欄位');
    error.statusCode = 400;
    throw error;
  }

  if (!ends_at) {
    const error = new Error('活動結束時間 (ends_at) 為必填欄位');
    error.statusCode = 400;
    throw error;
  }

  // 2. 時間有效性檢查
  const startDate = new Date(starts_at);
  const endDate = new Date(ends_at);

  if (isNaN(startDate.getTime())) {
    const error = new Error('活動開始時間格式無效，請使用 ISO 8601 時間格式 (例如: 2026-12-01T13:30:00Z)');
    error.statusCode = 400;
    throw error;
  }

  if (isNaN(endDate.getTime())) {
    const error = new Error('活動結束時間格式無效，請使用 ISO 8601 時間格式 (例如: 2026-12-01T16:30:00Z)');
    error.statusCode = 400;
    throw error;
  }

  // 3. 活動開始與結束時間合理性檢查
  if (endDate.getTime() <= startDate.getTime()) {
    const error = new Error('活動結束時間 (ends_at) 必須晚於開始時間 (starts_at)');
    error.statusCode = 400;
    throw error;
  }

  // 4. 報名期間檢查 (若有設定)
  let regStartIso = null;
  let regEndIso = null;

  if (registration_starts_at || registration_ends_at) {
    if (!registration_starts_at || !registration_ends_at) {
      const error = new Error('若設定報名期間，報名開始時間與報名截止時間皆為必填');
      error.statusCode = 400;
      throw error;
    }

    const regStartDate = new Date(registration_starts_at);
    const regEndDate = new Date(registration_ends_at);

    if (isNaN(regStartDate.getTime()) || isNaN(regEndDate.getTime())) {
      const error = new Error('報名時間格式無效，請使用 ISO 8601 時間格式');
      error.statusCode = 400;
      throw error;
    }

    if (regEndDate.getTime() <= regStartDate.getTime()) {
      const error = new Error('報名截止時間必須晚於報名開始時間');
      error.statusCode = 400;
      throw error;
    }

    if (regEndDate.getTime() > endDate.getTime()) {
      const error = new Error('報名截止時間不可晚於活動結束時間');
      error.statusCode = 400;
      throw error;
    }

    regStartIso = regStartDate.toISOString();
    regEndIso = regEndDate.toISOString();
  }

  return {
    title: title.trim(),
    description: description.trim(),
    location: location.trim(),
    starts_at: startDate.toISOString(),
    ends_at: endDate.toISOString(),
    registration_starts_at: regStartIso,
    registration_ends_at: regEndIso
  };
}

/**
 * 檢查使用者是否有建立活動之權限 (Admin 或 Event Manager)
 */
function checkPermission(currentUser) {
  if (!currentUser) {
    const error = new Error('未登入或憑證無效');
    error.statusCode = 401;
    throw error;
  }

  const allowedRoles = ['admin', 'event_manager'];
  if (!allowedRoles.includes(currentUser.role)) {
    const error = new Error('權限不足，僅管理員或活動管理者可建立活動');
    error.statusCode = 403;
    throw error;
  }
}

/**
 * 建立新活動 (US-07)
 */
async function createEvent(data, currentUser, customPool = null) {
  // 1. 權限檢查
  checkPermission(currentUser);

  // 2. 欄位及時間設定驗證
  const validated = validateEventData(data);

  // 3. 若強制指定使用 Mock 或環境未連線資料庫
  const activePool = customPool || pool;
  const isMockMode = process.env.USE_MOCK_DB === 'true' || activePool.isMock;

  if (isMockMode) {
    const newEvent = {
      id: mockIdCounter++,
      title: validated.title,
      description: validated.description,
      location: validated.location,
      starts_at: validated.starts_at,
      ends_at: validated.ends_at,
      created_at: new Date().toISOString()
    };
    mockEvents.push(newEvent);
    return newEvent;
  }

  try {
    const result = await activePool.query(
      `INSERT INTO events (title, description, location, starts_at, ends_at, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id, title, description, location, starts_at, ends_at, created_at`,
      [
        validated.title,
        validated.description,
        validated.location,
        validated.starts_at,
        validated.ends_at
      ]
    );

    const row = result.rows[0];
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      location: row.location,
      starts_at: new Date(row.starts_at).toISOString(),
      ends_at: new Date(row.ends_at).toISOString(),
      created_at: new Date(row.created_at).toISOString()
    };
  } catch (dbError) {
    // 若資料庫無法連線，且處於本機開發/測試環境，自動降級或提示錯誤
    if (dbError.code === 'ECONNREFUSED' || dbError.message.includes('connect')) {
      const error = new Error('資料庫連線失敗，請確認 PostgreSQL 是否已啟動且 .env 設定正確');
      error.statusCode = 503;
      throw error;
    }
    throw dbError;
  }
}

/**
 * 取得活動列表 (可搜尋)
 */
async function getAllEvents(searchQuery = '', customPool = null) {
  const activePool = customPool || pool;
  const isMockMode = process.env.USE_MOCK_DB === 'true' || activePool.isMock;

  if (isMockMode) {
    const q = (searchQuery || '').trim().toLowerCase();
    if (!q) return [...mockEvents];
    return mockEvents.filter(e =>
      e.title.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      e.location.toLowerCase().includes(q)
    );
  }

  try {
    let sql = `SELECT id, title, description, location, starts_at, ends_at, created_at FROM events`;
    const params = [];

    if (searchQuery && typeof searchQuery === 'string' && searchQuery.trim() !== '') {
      sql += ` WHERE title ILIKE $1 OR description ILIKE $1 OR location ILIKE $1`;
      params.push(`%${searchQuery.trim()}%`);
    }

    sql += ` ORDER BY starts_at ASC`;

    const result = await activePool.query(sql, params);
    return result.rows.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      location: row.location,
      starts_at: new Date(row.starts_at).toISOString(),
      ends_at: new Date(row.ends_at).toISOString(),
      created_at: new Date(row.created_at).toISOString()
    }));
  } catch (dbError) {
    if (dbError.code === 'ECONNREFUSED' || dbError.message.includes('connect')) {
      const error = new Error('資料庫連線失敗，請確認 PostgreSQL 設定');
      error.statusCode = 503;
      throw error;
    }
    throw dbError;
  }
}

/**
 * 取得單一活動資訊
 */
async function getEventById(id, customPool = null) {
  const activePool = customPool || pool;
  const isMockMode = process.env.USE_MOCK_DB === 'true' || activePool.isMock;

  if (isMockMode) {
    return mockEvents.find(e => e.id === id) || null;
  }

  const result = await activePool.query(
    `SELECT id, title, description, location, starts_at, ends_at, created_at
     FROM events
     WHERE id = $1`,
    [id]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    location: row.location,
    starts_at: new Date(row.starts_at).toISOString(),
    ends_at: new Date(row.ends_at).toISOString(),
    created_at: new Date(row.created_at).toISOString()
  };
}

/**
 * 關閉資料庫連線池
 */
async function closeDatabase() {
  await pool.end();
}

module.exports = {
  validateEventData,
  checkPermission,
  createEvent,
  getAllEvents,
  getEventById,
  closeDatabase,
  mockEvents
};


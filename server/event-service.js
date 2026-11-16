const { Pool } = require('pg');

const pool = new Pool({
  connectionTimeoutMillis: 5000
});

// 記憶體儲存庫 (當未連線資料庫或在測試環境時提供備用)
const mockEvents = [];
let mockIdCounter = 101;

// 活動欄位 (依 API 規格 v2.2 / 資料庫結構 2026-11-06)
const EVENT_COLUMNS = `id, title, description, location, starts_at, ends_at,
  registration_opens_at, registration_closes_at, is_published, created_at`;

// ISO 8601 時間字串須帶時區 (Z 或 ±hh:mm)
const TIMEZONE_PATTERN = /(Z|[+-]\d{2}:?\d{2})$/i;

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function requireText(value, label, field, maxLength) {
  if (!value || typeof value !== 'string' || value.trim() === '') {
    throw badRequest(`${label} (${field}) 為必填欄位且不可為空`);
  }
  if (maxLength && value.trim().length > maxLength) {
    throw badRequest(`${label} (${field}) 不可超過 ${maxLength} 字元`);
  }
  return value.trim();
}

function requireTime(value, label, field) {
  if (!value) {
    throw badRequest(`${label} (${field}) 為必填欄位`);
  }
  const date = new Date(value);
  if (typeof value !== 'string' || isNaN(date.getTime())) {
    throw badRequest(`${label}格式無效，請使用 ISO 8601 時間格式 (例如: 2026-12-01T13:30:00+08:00)`);
  }
  if (!TIMEZONE_PATTERN.test(value.trim())) {
    throw badRequest(`${label}必須帶時區 (例如: 2026-12-01T13:30:00+08:00 或 2026-12-01T05:30:00Z)`);
  }
  return date;
}

/**
 * 驗證活動資料欄位與時間設定 (US-07 / UI-05 建立與修改共用)
 * 時間順序：registration_opens_at < registration_closes_at <= starts_at < ends_at
 * @param {object} data
 * @returns {object} 清理與標準化後的資料
 */
function validateEventData(data) {
  if (!data || typeof data !== 'object') {
    throw badRequest('活動資料不得為空');
  }

  // 1. 必填文字欄位
  const title = requireText(data.title, '活動名稱', 'title', 100);
  const description = requireText(data.description, '活動說明', 'description');
  const location = requireText(data.location, '活動地點', 'location', 200);

  // 2. 必填時間欄位 (須帶時區)
  const startDate = requireTime(data.starts_at, '活動開始時間', 'starts_at');
  const endDate = requireTime(data.ends_at, '活動結束時間', 'ends_at');
  const opensDate = requireTime(data.registration_opens_at, '報名開始時間', 'registration_opens_at');
  const closesDate = requireTime(data.registration_closes_at, '報名截止時間', 'registration_closes_at');

  // 3. 公開狀態 (選填，預設 false)
  if (data.is_published !== undefined && typeof data.is_published !== 'boolean') {
    throw badRequest('公開狀態 (is_published) 必須為布林值 true 或 false');
  }
  const isPublished = data.is_published === true;

  // 4. 時間順序檢查
  if (endDate.getTime() <= startDate.getTime()) {
    throw badRequest('活動結束時間 (ends_at) 必須晚於開始時間 (starts_at)');
  }
  if (closesDate.getTime() <= opensDate.getTime()) {
    throw badRequest('報名截止時間 (registration_closes_at) 必須晚於報名開始時間 (registration_opens_at)');
  }
  if (closesDate.getTime() > startDate.getTime()) {
    throw badRequest('報名截止時間 (registration_closes_at) 不可晚於活動開始時間 (starts_at)');
  }

  return {
    title,
    description,
    location,
    starts_at: startDate.toISOString(),
    ends_at: endDate.toISOString(),
    registration_opens_at: opensDate.toISOString(),
    registration_closes_at: closesDate.toISOString(),
    is_published: isPublished
  };
}

/**
 * 檢查使用者是否有建立／修改活動之權限 (Admin 或 Event Manager)
 */
function checkPermission(currentUser, action = '新增') {
  if (!currentUser) {
    const error = new Error('未登入或憑證無效');
    error.statusCode = 401;
    throw error;
  }

  const allowedRoles = ['admin', 'event_manager'];
  if (!allowedRoles.includes(currentUser.role)) {
    const error = new Error(`權限不足，僅管理員或活動管理者可${action}活動`);
    error.statusCode = 403;
    throw error;
  }
}

function toIso(value) {
  return value ? new Date(value).toISOString() : null;
}

/**
 * 將資料庫列轉為 API 回傳格式
 */
function toEvent(row) {
  const event = {
    id: row.id,
    title: row.title,
    description: row.description,
    location: row.location,
    starts_at: toIso(row.starts_at),
    ends_at: toIso(row.ends_at),
    registration_opens_at: toIso(row.registration_opens_at),
    registration_closes_at: toIso(row.registration_closes_at),
    is_published: row.is_published === true,
    created_at: toIso(row.created_at)
  };
  // 負責人只在建立／修改的回應中提供（查詢有選取 manager_id 時）
  if (Object.prototype.hasOwnProperty.call(row, 'manager_id')) {
    event.manager_id = row.manager_id;
  }
  return event;
}

/**
 * 登入者編號必須是有效的 PostgreSQL INTEGER（活動負責人來源）
 */
function requireUserId(currentUser) {
  if (!Number.isInteger(currentUser.id) || currentUser.id <= 0 || currentUser.id > 2147483647) {
    const error = new Error('登入者編號無效');
    error.statusCode = 401;
    throw error;
  }
}

/**
 * 修改權限：admin 可修改所有活動；event_manager 只能修改負責人為本人的活動（SRD US-07、BFR-06）。
 * 尚未指定負責人（manager_id 為 NULL）的舊活動僅 admin 可修改，與 US-08 名單規則一致。
 */
function checkOwnership(event, currentUser) {
  if (currentUser.role === 'admin') return;
  if (event.manager_id == null || event.manager_id !== currentUser.id) {
    const error = new Error('權限不足，活動管理者只能修改自己負責的活動');
    error.statusCode = 403;
    throw error;
  }
}

function isMock(activePool) {
  return process.env.USE_MOCK_DB === 'true' || activePool.isMock;
}

function wrapDbError(dbError) {
  if (dbError.code === 'ECONNREFUSED' || dbError.message.includes('connect')) {
    const error = new Error('資料庫連線失敗，請確認 PostgreSQL 是否已啟動且 .env 設定正確');
    error.statusCode = 503;
    return error;
  }
  return dbError;
}

/**
 * 建立新活動 (US-07 / UI-05)
 */
async function createEvent(data, currentUser, customPool = null) {
  checkPermission(currentUser, '新增');
  // 負責人只能來自登入身分，不使用 request body 的 manager_id。
  requireUserId(currentUser);
  const validated = validateEventData(data);
  const activePool = customPool || pool;

  if (isMock(activePool)) {
    const newEvent = {
      id: mockIdCounter++,
      ...validated,
      manager_id: currentUser.id,
      created_at: new Date().toISOString()
    };
    mockEvents.push(newEvent);
    return { ...newEvent };
  }

  try {
    const result = await activePool.query(
      `INSERT INTO events (title, description, location, starts_at, ends_at, manager_id,
         registration_opens_at, registration_closes_at, is_published, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       RETURNING ${EVENT_COLUMNS}, manager_id`,
      [
        validated.title,
        validated.description,
        validated.location,
        validated.starts_at,
        validated.ends_at,
        currentUser.id,
        validated.registration_opens_at,
        validated.registration_closes_at,
        validated.is_published
      ]
    );
    return toEvent(result.rows[0]);
  } catch (dbError) {
    throw wrapDbError(dbError);
  }
}

/**
 * 修改活動資訊 (UI-05，API 2.4 PUT /api/events/{id})
 * 欄位同新增活動，整筆覆寫可編輯欄位。
 */
async function updateEvent(id, data, currentUser, customPool = null) {
  checkPermission(currentUser, '修改');
  if (!Number.isInteger(id) || id <= 0 || id > 2147483647) {
    throw badRequest('活動編號必須為正整數');
  }
  const validated = validateEventData(data);
  const activePool = customPool || pool;

  const notFound = () => {
    const error = new Error('找不到該活動');
    error.statusCode = 404;
    return error;
  };

  if (isMock(activePool)) {
    const target = mockEvents.find(e => String(e.id) === String(id));
    if (!target) throw notFound();
    checkOwnership(target, currentUser);
    Object.assign(target, validated);
    return { ...target };
  }

  try {
    // 先確認活動存在與負責人，再更新（負責人欄位不允許經由此 API 變更）
    const existing = await activePool.query(
      'SELECT id, manager_id FROM events WHERE id = $1',
      [id]
    );
    if (existing.rows.length === 0) throw notFound();
    checkOwnership(existing.rows[0], currentUser);

    const result = await activePool.query(
      `UPDATE events
       SET title = $1, description = $2, location = $3, starts_at = $4, ends_at = $5,
           registration_opens_at = $6, registration_closes_at = $7, is_published = $8
       WHERE id = $9
       RETURNING ${EVENT_COLUMNS}, manager_id`,
      [
        validated.title,
        validated.description,
        validated.location,
        validated.starts_at,
        validated.ends_at,
        validated.registration_opens_at,
        validated.registration_closes_at,
        validated.is_published,
        id
      ]
    );
    if (result.rows.length === 0) throw notFound();
    return toEvent(result.rows[0]);
  } catch (dbError) {
    if (dbError.statusCode) throw dbError;
    throw wrapDbError(dbError);
  }
}

/**
 * 取得活動列表 (可搜尋)
 */
async function getAllEvents(searchQuery = '', customPool = null) {
  const activePool = customPool || pool;

  if (isMock(activePool)) {
    const q = (searchQuery || '').trim().toLowerCase();
    const list = mockEvents.map(e => ({ ...e }));
    if (!q) return list;
    return list.filter(e =>
      e.title.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      e.location.toLowerCase().includes(q)
    );
  }

  try {
    let sql = `SELECT ${EVENT_COLUMNS} FROM events`;
    const params = [];

    if (searchQuery && typeof searchQuery === 'string' && searchQuery.trim() !== '') {
      sql += ` WHERE title ILIKE $1 OR description ILIKE $1 OR location ILIKE $1`;
      params.push(`%${searchQuery.trim()}%`);
    }

    sql += ` ORDER BY starts_at ASC`;

    const result = await activePool.query(sql, params);
    return result.rows.map(toEvent);
  } catch (dbError) {
    throw wrapDbError(dbError);
  }
}

/**
 * 取得單一活動資訊
 */
async function getEventById(id, customPool = null) {
  const activePool = customPool || pool;

  if (isMock(activePool)) {
    const found = mockEvents.find(e => String(e.id) === String(id));
    return found ? { ...found } : null;
  }

  const result = await activePool.query(
    `SELECT ${EVENT_COLUMNS} FROM events WHERE id = $1`,
    [id]
  );

  if (result.rows.length === 0) return null;
  return toEvent(result.rows[0]);
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
  updateEvent,
  getAllEvents,
  getEventById,
  closeDatabase,
  mockEvents
};

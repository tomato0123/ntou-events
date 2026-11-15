const { Pool } = require('pg');
const { mockEvents } = require('./event-service');

const pool = new Pool({
  connectionTimeoutMillis: 5000
});

// 記憶體儲存庫 (提供測試環境或未連線資料庫時備用)
const mockRegistrations = [];
// 測試用目前使用者資料；授權不採用 Token 內可能過時的 role。
const mockUsers = [];

function checkManagerPermission(currentUser) {
  if (!currentUser) {
    const error = new Error('未登入或憑證無效');
    error.statusCode = 401;
    throw error;
  }

  const allowedRoles = ['admin', 'event_manager'];
  if (!allowedRoles.includes(currentUser.role)) {
    const error = new Error('權限不足，僅管理員或活動管理者可查看報名名單');
    error.statusCode = 403;
    throw error;
  }
}

function checkEventOwner(event, currentUser) {
  if (!event) {
    const error = new Error('找不到該活動');
    error.statusCode = 404;
    throw error;
  }
  if (currentUser.role === 'admin') return;
  if (!Number.isInteger(currentUser.id) || currentUser.id <= 0 ||
      event.manager_id == null || event.manager_id !== currentUser.id) {
    const error = new Error('權限不足，僅可查看自己負責活動的報名名單');
    error.statusCode = 403;
    throw error;
  }
}

async function getMyRegistrations(userId, customPool = null) {
  if (!Number.isInteger(userId) || userId <= 0) {
    const error = new Error('使用者編號必須是正整數');
    error.statusCode = 400;
    throw error;
  }

  const activePool = customPool || pool;
  const isMockMode = process.env.USE_MOCK_DB === 'true' || activePool.isMock;

  if (isMockMode) {
    const list = mockRegistrations.filter(r => r.user_id === userId);
    return { data: list };
  }

  const result = await activePool.query(
    `SELECT
       r.id,
       r.user_id,
       r.event_id,
       r.status,
       r.registered_at,
       e.title,
       e.location,
       e.starts_at,
       e.ends_at
     FROM registrations AS r
     JOIN events AS e ON r.event_id = e.id
     WHERE r.user_id = $1
     ORDER BY r.registered_at DESC, r.id DESC`,
    [userId]
  );

  return {
    data: result.rows.map(row => ({
      id: row.id,
      user_id: row.user_id,
      event_id: row.event_id,
      status: row.status,
      registered_at: row.registered_at,
      event: {
        title: row.title,
        location: row.location,
        starts_at: row.starts_at,
        ends_at: row.ends_at
      }
    }))
  };
}

/**
 * [US-08] 管理者查看特定活動的正式與取消名單
 */
async function getEventRegistrations(eventId, currentUser, customPool = null, status) {
  if (!currentUser || !Number.isInteger(currentUser.id) ||
      currentUser.id <= 0 || currentUser.id > 2147483647) {
    const error = new Error('未登入或憑證無效');
    error.statusCode = 401;
    throw error;
  }

  if (!Number.isInteger(eventId) || eventId <= 0 || eventId > 2147483647) {
    const error = new Error('活動編號必須是正整數');
    error.statusCode = 400;
    throw error;
  }
  if (status !== undefined && !['registered', 'cancelled'].includes(status)) {
    const error = new Error('status 僅允許 registered 或 cancelled');
    error.statusCode = 400;
    throw error;
  }

  const activePool = customPool || pool;
  const isMockMode = process.env.USE_MOCK_DB === 'true' || activePool.isMock;

  const user = isMockMode
    ? mockUsers.find(item => item.id === currentUser.id)
    : (await activePool.query('SELECT id, role FROM users WHERE id = $1', [currentUser.id])).rows[0];
  checkManagerPermission(user);

  if (isMockMode) {
    const event = mockEvents.find(item => item.id === eventId);
    checkEventOwner(event, user);
    const rows = mockRegistrations
      .filter(r => r.event_id === eventId && (status === undefined || r.status === status))
      .sort((a, b) => new Date(a.registered_at) - new Date(b.registered_at) || a.id - b.id)
      .map(r => {
        const member = mockUsers.find(item => item.id === r.user_id);
        return { ...r, user_name: member?.name, user_email: member?.email,
          campus_identity: member?.campus_identity, gender: member?.gender };
      });
    return formatRoster(eventId, rows);
  }

  const eventCheck = await activePool.query(
    'SELECT id, title, manager_id FROM events WHERE id = $1',
    [eventId]
  );
  checkEventOwner(eventCheck.rows[0], user);

  const result = await activePool.query(
    `SELECT
       r.id,
       r.user_id,
       r.event_id,
       r.status,
       r.registered_at,
       u.name AS user_name,
       u.email AS user_email,
       u.campus_identity,
       u.gender
     FROM registrations AS r
     LEFT JOIN users AS u ON r.user_id = u.id
     WHERE r.event_id = $1
       AND ($2::text IS NULL OR r.status = $2)
     ORDER BY r.registered_at ASC, r.id ASC`,
    [eventId, status ?? null]
  );

  return formatRoster(eventId, result.rows);
}

function formatRoster(eventId, rows) {
  const data = rows.map(row => ({
    registration_id: row.id,
    status: row.status,
    registered_at: row.registered_at ? new Date(row.registered_at).toISOString() : null,
    user: {
      id: row.user_id,
      name: row.user_name ?? null,
      email: row.user_email ?? null,
      campus_identity: row.campus_identity ?? null,
      gender: row.gender ?? null
    }
  }));

  return { event_id: eventId, total_count: data.length, data };
}

async function closeDatabase() {
  await pool.end();
}

module.exports = {
  getMyRegistrations,
  getEventRegistrations,
  closeDatabase,
  mockRegistrations,
  mockUsers
};

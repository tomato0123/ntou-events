const { Pool } = require('pg');
const { mockEvents } = require('./event-service');

const pool = new Pool({
  connectionTimeoutMillis: 5000
});

// 記憶體儲存庫 (提供測試環境或未連線資料庫時備用)
const mockRegistrations = [];

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
async function getEventRegistrations(eventId, currentUser, customPool = null) {
  checkManagerPermission(currentUser);

  if (!Number.isInteger(eventId) || eventId <= 0) {
    const error = new Error('活動編號必須是正整數');
    error.statusCode = 400;
    throw error;
  }

  const activePool = customPool || pool;
  const isMockMode = process.env.USE_MOCK_DB === 'true' || activePool.isMock;

  if (isMockMode) {
    const event = mockEvents.find(item => item.id === eventId);
    checkEventOwner(event, currentUser);
    const all = mockRegistrations.filter(r => r.event_id === eventId);
    const confirmed = all.filter(r => r.status === 'registered');
    const cancelled = all.filter(r => r.status === 'cancelled');

    return {
      event_id: eventId,
      summary: {
        confirmed_count: confirmed.length,
        cancelled_count: cancelled.length,
        total_count: all.length
      },
      confirmed,
      cancelled
    };
  }

  const eventCheck = await activePool.query(
    'SELECT id, title, manager_id FROM events WHERE id = $1',
    [eventId]
  );
  checkEventOwner(eventCheck.rows[0], currentUser);

  const result = await activePool.query(
    `SELECT
       r.id,
       r.user_id,
       r.event_id,
       r.status,
       r.registered_at,
       u.name AS user_name,
       u.email AS user_email
     FROM registrations AS r
     LEFT JOIN users AS u ON r.user_id = u.id
     WHERE r.event_id = $1
     ORDER BY r.registered_at ASC, r.id ASC`,
    [eventId]
  );

  const formattedRows = result.rows.map(row => ({
    id: row.id,
    user_id: row.user_id,
    event_id: row.event_id,
    status: row.status,
    registered_at: row.registered_at ? new Date(row.registered_at).toISOString() : null,
    user: {
      id: row.user_id,
      name: row.user_name || null,
      email: row.user_email || null
    }
  }));

  const confirmed = formattedRows.filter(r => r.status === 'registered');
  const cancelled = formattedRows.filter(r => r.status === 'cancelled');

  return {
    event_id: eventId,
    event_title: eventCheck.rows[0].title,
    summary: {
      confirmed_count: confirmed.length,
      cancelled_count: cancelled.length,
      total_count: formattedRows.length
    },
    confirmed,
    cancelled
  };
}

async function closeDatabase() {
  await pool.end();
}

module.exports = {
  getMyRegistrations,
  getEventRegistrations,
  closeDatabase,
  mockRegistrations
};

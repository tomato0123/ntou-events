const { Pool } = require('pg');
const { AppError } = require('./app-error');

const pool = new Pool({ connectionTimeoutMillis: 5000 });

function positiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AppError(400, `${label}必須是正整數`);
  }
  return parsed;
}

function registrationData(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    event_id: row.event_id,
    status: row.status,
    registered_at: row.registered_at
  };
}

async function registerForEvent(userId, eventId, database = pool) {
  const safeUserId = positiveInteger(userId, '使用者編號');
  const safeEventId = positiveInteger(eventId, '活動編號');
  const client = await database.connect();

  try {
    await client.query('BEGIN');
    const eventResult = await client.query(
      'SELECT id FROM events WHERE id = $1',
      [safeEventId]
    );

    if (eventResult.rowCount === 0) {
      throw new AppError(404, '找不到該活動');
    }

    const result = await client.query(
      `INSERT INTO registrations (user_id, event_id, status)
       VALUES ($1, $2, 'registered')
       RETURNING id, user_id, event_id, status, registered_at`,
      [safeUserId, safeEventId]
    );

    await client.query('COMMIT');
    return registrationData(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      throw new AppError(409, '您已報名過此活動，請勿重複報名');
    }
    if (error.code === '23503') {
      throw new AppError(404, '找不到使用者或活動');
    }
    throw error;
  } finally {
    client.release();
  }
}

async function getMyRegistrations(userId, database = pool) {
  const safeUserId = positiveInteger(userId, '使用者編號');
  const result = await database.query(
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
    [safeUserId]
  );

  return result.rows.map(row => ({
    ...registrationData(row),
    event: {
      title: row.title,
      location: row.location,
      starts_at: row.starts_at,
      ends_at: row.ends_at
    }
  }));
}

async function closeDatabase() {
  await pool.end();
}

module.exports = { registerForEvent, getMyRegistrations, closeDatabase, pool };

const { Pool } = require('pg');

const pool = new Pool({
  connectionTimeoutMillis: 5000
});

class RegistrationError extends Error { constructor(statusCode,message) { super(message); this.statusCode=statusCode; } }
function positiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new RegistrationError(400, `${label}必須是正整數`);
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
    await require('./registration-eligibility').requireVerifiedUser(client, safeUserId);
    const eventResult = await client.query(
      'SELECT * FROM events WHERE id = $1 FOR SHARE',
      [safeEventId]
    );

    if (eventResult.rowCount === 0) {
      throw new RegistrationError(404, '找不到該活動');
    }

    const event=eventResult.rows[0];
    const now=Date.now();
    if(event.is_public === false || event.status === 'draft') throw new RegistrationError(404,'找不到該活動');
    if((event.registration_starts_at && now < new Date(event.registration_starts_at).getTime()) ||
       (event.registration_ends_at && now >= new Date(event.registration_ends_at).getTime()) ||
       (event.starts_at && now >= new Date(event.starts_at).getTime())) throw new RegistrationError(409,'目前不在報名期間');
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
      throw new RegistrationError(409, '您已報名過此活動，請勿重複報名');
    }
    if (error.code === '23503') {
      throw new RegistrationError(404, '找不到使用者或活動');
    }
    throw error;
  } finally {
    client.release();
  }
}


async function getMyRegistrations(userId) {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error('使用者編號必須是正整數');
  }

  const result = await pool.query(
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

async function closeDatabase() {
  await pool.end();
}

module.exports = {
  registerForEvent,
  pool,
  getMyRegistrations,
  closeDatabase
};
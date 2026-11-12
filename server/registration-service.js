const { Pool } = require('pg');

const pool = new Pool({
  connectionTimeoutMillis: 5000
});

function positiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    const error = new Error(`${label}必須是正整數`);
    error.statusCode = 400;
    throw error;
  }
  return parsed;
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

async function cancelMyRegistration(userId, registrationId, database = pool) {
  const safeUserId = positiveInteger(userId, '使用者編號');
  const safeRegistrationId = positiveInteger(registrationId, '報名編號');
  const result = await database.query(
    `UPDATE registrations
     SET status = 'cancelled'
     WHERE id = $1
       AND user_id = $2
       AND status = 'registered'
     RETURNING id, user_id, event_id, status, registered_at`,
    [safeRegistrationId, safeUserId]
  );

  if (result.rowCount === 0) {
    const error = new Error('找不到可取消的本人有效報名');
    error.statusCode = 404;
    throw error;
  }

  return result.rows[0];
}

async function closeDatabase() {
  await pool.end();
}

module.exports = {
  getMyRegistrations,
  cancelMyRegistration,
  closeDatabase
};

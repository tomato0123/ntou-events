const { Pool } = require('pg');

const pool = new Pool({
  connectionTimeoutMillis: 5000
});

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

// Lock both records so simultaneous cancellation and event time changes cannot
// bypass the deadline. Cancelled rows are retained; repeated calls are idempotent.
async function cancelMyRegistration(userId, registrationId) {
  if (![userId, registrationId].every(id => Number.isSafeInteger(id) && id > 0)) {
    throw new Error('編號必須是正整數');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT r.id, r.status, e.starts_at FROM registrations r
       JOIN events e ON e.id = r.event_id
       WHERE r.id = $1 AND r.user_id = $2 FOR UPDATE OF r, e`,
      [registrationId, userId]
    );
    const row = result.rows[0];
    if (!row) throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    if (row.status !== 'cancelled') {
      const update = await client.query(
        `UPDATE registrations SET status = 'cancelled'
         WHERE id = $1 AND user_id = $2 AND status = 'registered'
           AND $3::timestamptz > clock_timestamp() RETURNING id`,
        [registrationId, userId, row.starts_at]
      );
      if (!update.rowCount) throw Object.assign(new Error('Started'), { code: 'STARTED' });
    }
    await client.query('COMMIT');
    return { data: { id: registrationId, status: 'cancelled' } };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

module.exports = {
  getMyRegistrations,
  cancelMyRegistration,
  closeDatabase
};

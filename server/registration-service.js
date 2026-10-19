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

module.exports = {
  getMyRegistrations,
  closeDatabase
};
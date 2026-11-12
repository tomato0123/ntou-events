const { Pool } = require('pg');

const pool = new Pool({
  connectionTimeoutMillis: 5000
});

const ASSIGNABLE_ROLES = new Set(['user', 'event_manager']);

function positiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    const error = new Error(`${label}必須是正整數`);
    error.statusCode = 400;
    throw error;
  }
  return parsed;
}

function assignableRole(value) {
  if (!ASSIGNABLE_ROLES.has(value)) {
    const error = new Error('角色只能是 user 或 event_manager');
    error.statusCode = 400;
    throw error;
  }
  return value;
}

async function setEventManagerPermission(userId, role, database = pool) {
  const safeUserId = positiveInteger(userId, '使用者編號');
  const safeRole = assignableRole(role);
  const result = await database.query(
    `UPDATE users
     SET role = $2
     WHERE id = $1
       AND role <> 'admin'
     RETURNING id, name, email, role, campus_identity`,
    [safeUserId, safeRole]
  );

  if (result.rowCount === 0) {
    const error = new Error('找不到可變更權限的使用者');
    error.statusCode = 404;
    throw error;
  }

  return result.rows[0];
}

module.exports = {
  setEventManagerPermission
};

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'ntou-events-secret-2026';

/**
 * 簽發 JWT Token
 * @param {object} payload - 包含 { id, name, email, role } 等使用者資訊
 * @returns {string} token
 */
function generateToken(payload) {
  return jwt.sign(
    {
      id: payload.id,
      name: payload.name,
      email: payload.email,
      role: payload.role || 'user'
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

/**
 * 驗證 JWT Token
 * @param {string} token
 * @returns {object} decoded payload
 */
function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

/**
 * Express 身分驗證 Middleware
 * 依據規範檢查 Request Header: Authorization: Bearer <your_jwt_token>
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: '未提供認證權杖，請先登入' });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: '認證權杖格式錯誤 (格式應為: Bearer <token>)' });
  }

  const token = parts[1];
  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: '認證權杖無效或已過期' });
  }
}

/**
 * 檢查角色權限 Middleware
 * @param {string|string[]} allowedRoles - 允許的角色 (例: ['admin', 'event_manager'])
 */
function requireRole(allowedRoles) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: '請先登入' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: '權限不足，操作遭拒絕' });
    }

    next();
  };
}

module.exports = {
  JWT_SECRET,
  generateToken,
  verifyToken,
  authenticateToken,
  requireRole
};


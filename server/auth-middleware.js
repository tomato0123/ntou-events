const jwt = require('jsonwebtoken');
const { AppError } = require('./app-error');

const DEFAULT_JWT_SECRET = 'ntou-events-secret-2026';
const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;

function jwtSecret() {
  return process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
}

function generateToken(payload) {
  return jwt.sign(
    {
      id: payload.id,
      name: payload.name,
      email: payload.email,
      role: payload.role || 'user'
    },
    jwtSecret(),
    { algorithm: 'HS256', expiresIn: '7d' }
  );
}

function verifyToken(token) {
  return jwt.verify(token, jwtSecret(), { algorithms: ['HS256'] });
}

function authenticateJwt(req, _res, next) {
  try {
    const authorization = req.get('authorization') || '';
    const match = /^Bearer\s+(.+)$/i.exec(authorization);

    if (!match) throw new AppError(401, '請先登入');

    const payload = verifyToken(match[1]);
    const userId = Number(payload.sub ?? payload.id ?? payload.user_id);

    if (!Number.isInteger(userId) || userId <= 0) {
      throw new AppError(401, '登入憑證無效');
    }

    req.user = { id: userId, role: payload.role || 'user' };
    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
      return;
    }
    next(new AppError(401, '登入憑證無效或已過期'));
  }
}

const authenticateToken = authenticateJwt;

function requireRole(allowedRoles) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return (req, _res, next) => {
    if (!req.user) {
      next(new AppError(401, '請先登入'));
      return;
    }

    if (!roles.includes(req.user.role)) {
      next(new AppError(403, '權限不足，操作遭拒絕'));
      return;
    }

    next();
  };
}

module.exports = {
  JWT_SECRET,
  generateToken,
  verifyToken,
  authenticateJwt,
  authenticateToken,
  requireRole
};

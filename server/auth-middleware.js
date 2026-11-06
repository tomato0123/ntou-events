const jwt = require('jsonwebtoken');
const { AppError } = require('./app-error');

function authenticateJwt(req, _res, next) {
  try {
    const authorization = req.get('authorization') || '';
    const match = /^Bearer\s+(.+)$/i.exec(authorization);

    if (!match) throw new AppError(401, '請先登入');
    if (!process.env.JWT_SECRET) throw new AppError(500, '伺服器尚未設定 JWT_SECRET');

    const payload = jwt.verify(match[1], process.env.JWT_SECRET, { algorithms: ['HS256'] });
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

module.exports = { authenticateJwt };

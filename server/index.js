const express = require('express');
const { authenticateJwt } = require('./auth-middleware');
const { AppError } = require('./app-error');
const { registerForEvent, getMyRegistrations, pool } = require('./registration-service');

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function createApp({ database = pool, authenticate = authenticateJwt } = {}) {
  const app = express();
  app.use(express.json({ limit: '16kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ message: '後端運作正常' });
  });

  app.post('/api/events/:id/register', authenticate, asyncRoute(async (req, res) => {
    const data = await registerForEvent(req.user.id, req.params.id, database);
    res.status(201).json({ message: '報名成功', data });
  }));

  app.get('/api/users/me/registrations', authenticate, asyncRoute(async (req, res) => {
    const data = await getMyRegistrations(req.user.id, database);
    res.json({ data });
  }));

  app.use((_req, _res, next) => next(new AppError(404, '找不到 API 路徑')));
  app.use((error, _req, res, _next) => {
    if (error instanceof SyntaxError && error.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'JSON 格式錯誤' });
      return;
    }

    const known = error instanceof AppError;
    if (!known) console.error(error);
    res.status(known ? error.status : 500).json({
      error: known ? error.message : '伺服器暫時無法處理請求'
    });
  });

  return app;
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 8000;
  createApp().listen(port, '127.0.0.1', () => {
    console.log(`後端已啟動：http://127.0.0.1:${port}`);
  });
}

module.exports = { createApp };

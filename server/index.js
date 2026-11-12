const express = require('express');
const cors = require('cors');
const {
  createEvent,
  getAllEvents,
  getEventById
} = require('./event-service');
const {
  authenticateToken,
  requireRole,
  generateToken
} = require('./auth-middleware');
const { AppError } = require('./app-error');
const {
  registerForEvent,
  getMyRegistrations,
  pool
} = require('./registration-service');

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function createApp({ database = pool, authenticate = authenticateToken } = {}) {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '16kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ message: '後端運作正常' });
  });

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body || {};

    if (!email || !password) {
      res.status(400).json({ error: '請輸入電子信箱與密碼' });
      return;
    }

    let role = 'user';
    let name = '一般學生';
    let id = 1;

    if (email.includes('admin')) {
      role = 'admin';
      name = '系統管理員';
      id = 99;
    } else if (email.includes('manager')) {
      role = 'event_manager';
      name = '活動管理者';
      id = 50;
    }

    const user = { id, name, email, role };
    res.json({ message: '登入成功', token: generateToken(user), user });
  });

  app.get('/api/events', asyncRoute(async (req, res) => {
    const events = await getAllEvents(req.query.search || '');
    res.json({ data: events });
  }));

  app.get('/api/events/:id', asyncRoute(async (req, res) => {
    const eventId = Number(req.params.id);
    if (!Number.isInteger(eventId) || eventId <= 0) {
      throw new AppError(400, '活動編號必須為正整數');
    }

    const event = await getEventById(eventId);
    if (!event) throw new AppError(404, '找不到該活動');
    res.json(event);
  }));

  app.post(
    '/api/events',
    authenticateToken,
    requireRole(['admin', 'event_manager']),
    asyncRoute(async (req, res) => {
      const newEvent = await createEvent(req.body, req.user);
      res.status(201).json({ message: '活動建立成功', data: newEvent });
    })
  );

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

    const status = error.statusCode || error.status || 500;
    if (status >= 500) console.error('伺服器錯誤：', error);
    res.status(status).json({
      error: status >= 500 ? '伺服器暫時無法處理請求' : error.message
    });
  });

  return app;
}

const app = createApp();
const PORT = Number(process.env.PORT) || 8000;
const HOST = process.env.HOST || '127.0.0.1';

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`後端已啟動：http://${HOST}:${PORT}`);
  });
}

module.exports = app;
module.exports.createApp = createApp;

const express = require('express');
const cors = require('cors');
const path = require('node:path');
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
const {
  registerForEvent,
  cancelMyRegistration,
  getCurrentUser,
  getMyRegistrations,
  getEventRegistrations,
  getManagedEvents
} = require('./registration-service');
const {
  setEventManagerPermission
} = require('./user-role-service');

const app = express();

// 允許跨來源請求與 JSON 解析
app.use(cors());
app.use(express.json());

// 僅提供明確列出的前端檔案，不公開專案根目錄或 server/.env。
for (const file of ['index.html', 'styles.css', 'app.js', 'manager.html', 'manager.css',
  'manager.js', 'auth-session.js']) {
  app.get(file === 'index.html' ? ['/', '/index.html'] : `/${file}`, (req, res) => {
    res.sendFile(path.join(__dirname, '..', file));
  });
}
// 後端自行提供網頁時永遠使用同源，支援自訂 PORT 與反向代理。
app.get('/api-config.js', (req, res) => {
  res.type('js').send('window.NtouConfig = Object.freeze({ apiBase: "/api" });');
});

// 健康檢查端點
app.get('/api/health', (req, res) => {
  res.json({ message: '後端運作正常' });
});

// ==========================================
// 1. 身分驗證 (Auth)
// ==========================================

// 1.2 使用者登入 (提供快速產生測試 Token，包含 role 身分)
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: '請輸入電子信箱與密碼' });
  }

  // 測試/原型階段模擬帳號權限判斷（依信箱關鍵字分配角色）
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
  const token = generateToken(user);

  res.json({
    message: '登入成功',
    token,
    user
  });
});

function createSetEventManagerPermissionHandler(
  setPermission = setEventManagerPermission
) {
  return async (req, res) => {
    try {
      const data = await setPermission(req.params.id, req.body?.role);
      res.json({
        message: data.role === 'event_manager'
          ? '已授予活動管理者權限'
          : '已撤銷活動管理者權限',
        data
      });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('變更活動管理者權限失敗：', error.message);
      res.status(status).json({
        error: status >= 500 ? '變更活動管理者權限失敗' : error.message
      });
    }
  };
}

// 1.3 授予或撤銷活動管理者權限 (US-06，僅系統管理員)
app.patch(
  '/api/admin/users/:id/role',
  authenticateToken,
  requireRole('admin'),
  createSetEventManagerPermissionHandler()
);

// ==========================================
// 2. 活動模組 (Events)
// ==========================================

// 2.1 取得所有活動列表 (公開 Public)
app.get('/api/events', async (req, res) => {
  try {
    const searchQuery = req.query.search || '';
    const events = await getAllEvents(searchQuery);
    res.json({ data: events });
  } catch (error) {
    console.error('查詢活動失敗：', error.message);
    res.status(error.statusCode || 500).json({ error: error.message || '查詢活動失敗' });
  }
});

// 2.2 取得單一活動詳細資訊 (公開 Public)
app.get('/api/events/:id', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id, 10);
    if (isNaN(eventId)) {
      return res.status(400).json({ error: '活動編號必須為整數' });
    }

    const event = await getEventById(eventId);
    if (!event) {
      return res.status(404).json({ error: '找不到該活動' });
    }

    res.json(event);
  } catch (error) {
    console.error('取得活動詳細資訊失敗：', error.message);
    res.status(error.statusCode || 500).json({ error: error.message || '取得活動失敗' });
  }
});

// 2.3 新增活動 (US-07: 需登入且 role 為 admin 或 event_manager)
app.post(
  '/api/events',
  authenticateToken,
  async (req, res) => {
    try {
      // 權限以資料庫目前角色為準，不信任可能已過期的 JWT role。
      const currentUser = await getCurrentUser(req.user);
      const newEvent = await createEvent(req.body, currentUser);
      res.status(201).json({
        message: '活動建立成功',
        data: newEvent
      });
    } catch (error) {
      const status = error.statusCode || 400;
      res.status(status).json({ error: error.message });
    }
  }
);

// ==========================================
// 3. 報名模組 (Registrations)
// ==========================================

// 3.2 查看自己的報名紀錄 (需登入)
app.get('/api/users/me/registrations', authenticateToken, async (req, res) => {
  try {
    const result = await getMyRegistrations(req.user.id);
    res.json(result);
  } catch (error) {
    console.error('查詢個人報名紀錄失敗：', error.message);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

function createRegisterForEventHandler(register = registerForEvent) {
  return async (req, res) => {
    try {
      const data = await register(req.user.id, req.params.id);
      res.status(201).json({ message: '報名成功', data });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('活動報名失敗：', error.message);
      res.status(status).json({
        error: status >= 500 ? '活動報名失敗' : error.message
      });
    }
  };
}

function createCancelRegistrationHandler(cancel = cancelMyRegistration) {
  return async (req, res) => {
    try {
      const data = await cancel(req.user.id, req.params.id);
      res.json({ message: '取消報名成功', data });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('取消報名失敗：', error.message);
      res.status(status).json({
        error: status >= 500 ? '取消報名失敗' : error.message
      });
    }
  };
}

// 3.3 登入者報名活動 (US-03)
app.post(
  '/api/events/:id/register',
  authenticateToken,
  createRegisterForEventHandler()
);

// 3.4 登入者取消本人的有效報名 (US-04)
app.delete(
  '/api/users/me/registrations/:id',
  authenticateToken,
  createCancelRegistrationHandler()
);

// 3.3 管理者查看特定活動的正式與取消名單 (US-08)
function privateResponse(req, res, next) {
  res.set('Cache-Control', 'no-store');
  next();
}

app.get('/api/manage/events', privateResponse, authenticateToken, async (req, res) => {
  try {
    res.json(await getManagedEvents(req.user));
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ error: status >= 500 ? '無法載入管理活動，請稍後再試' : error.message });
  }
});

app.get('/api/events/:id/registrations', privateResponse, authenticateToken, async (req, res) => {
    try {
      const eventId = Number(req.params.id);
      if (!/^[0-9]+$/.test(req.params.id) || !Number.isInteger(eventId) ||
          eventId <= 0 || eventId > 2147483647) {
        return res.status(400).json({ error: '活動編號必須是有效的正整數' });
      }

      const result = await getEventRegistrations(eventId, req.user, null, req.query.status);
      res.json(result);
    } catch (error) {
      const status = error.statusCode || 500;
      res.status(status).json({ error: status >= 500 ? '查詢活動名單失敗，請稍後再試' : error.message });
    }
  }
);

// 全域錯誤處理 (符合統一錯誤回傳格式: { "error": "..." })
app.use((err, req, res, next) => {
  console.error('伺服器錯誤：', err);
  const status = err.statusCode || err.status || 500;
  res.status(status).json({
    error: err.message || '伺服器內部錯誤'
  });
});

const PORT = process.env.PORT || 8000;
const HOST = process.env.HOST || '127.0.0.1';

// 僅在直接透過 node index.js 啟動時才監聽 port
if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`後端已啟動：http://${HOST}:${PORT}`);
  });
}

module.exports = app;
module.exports.createRegisterForEventHandler = createRegisterForEventHandler;
module.exports.createCancelRegistrationHandler = createCancelRegistrationHandler;
module.exports.createSetEventManagerPermissionHandler =
  createSetEventManagerPermissionHandler;

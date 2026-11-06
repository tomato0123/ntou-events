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
const {
  getMyRegistrations
} = require('./registration-service');

const app = express();

// 允許跨來源請求與 JSON 解析
app.use(cors());
app.use(express.json());

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
  requireRole(['admin', 'event_manager']),
  async (req, res) => {
    try {
      const newEvent = await createEvent(req.body, req.user);
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

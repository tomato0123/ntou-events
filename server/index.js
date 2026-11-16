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
  pool: registrationPool,
  getMyRegistrations,
  getEventRegistrations,
  getManagedEvents
} = require('./registration-service');

const {createAuthService, config} = require('./auth-service');
const {createMailer} = require('./mail-adapter');
const fs = require('node:fs');

function createApp({authService, database = registrationPool} = {}) {
const app = express();
const auth = authService || createAuthService({sendMail: message => createMailer()(message)});

// 允許跨來源請求與 JSON 解析
app.use(cors());
app.use(express.json({limit:'16kb'}));

// 合併 UI-03 與 UI-06 靜態白名單，沒有 repo-wide express.static。
const publicFiles = ['index.html', 'styles.css', 'app.js', 'manager.html', 'manager.css',
  'manager.js', 'auth-session.js', 'auth-client.js', 'account.js', 'account.css',
  'login.html', 'register.html', 'verify-email.html', 'resend-verification.html'];
for (const file of publicFiles) {
  app.get(file === 'index.html' ? ['/', '/index.html'] : `/${file}`, (_req, res) => {
    res.sendFile(path.join(__dirname, '..', file));
  });
}
// 無論 PORT 為何，內建靜態服務使用同源；其餘邏輯與獨立前端共用同一檔案。
app.get('/api-config.js', (_req, res) => {
  res.type('js').send('window.NtouConfig = { apiBase: "/api" };\n' +
    fs.readFileSync(path.join(__dirname, '..', 'api-config.js'), 'utf8'));
});

// 健康檢查端點
app.get('/api/health', (req, res) => {
  res.json({ message: '後端運作正常' });
});

// ==========================================
// 1. 身分驗證 (Auth)
// ==========================================

const authRoute = fn => async (req,res) => {
  res.set('Cache-Control','no-store');
  try { await fn(req,res); } catch(e) {
    if(e.retryAfter) res.set('Retry-After',String(e.retryAfter));
    res.status(e.statusCode || 503).json({error:e.statusCode?e.message:'帳號服務暫時無法使用，請稍後重試'});
  }
};
app.post('/api/auth/register', authRoute(async(req,res)=>res.status(201).json(await auth.register(req.body || {}))));
app.post('/api/auth/login', authRoute(async(req,res)=>{
  const user=await auth.login(req.body || {});
  res.json({message:'登入成功',token:generateToken(user),user});
}));
app.get(['/api/users/me','/api/auth/me'],authenticateToken,authRoute(async(req,res)=>res.json(await auth.me(req.user.id))));
app.post('/api/auth/verify-email',authRoute(async(req,res)=>res.json(await auth.verify(req.body?.token))));
app.post('/api/auth/resend-verification',authRoute(async(req,res)=>res.status(202).json(await auth.resend(req.body?.email,req.ip))));

// ==========================================
// 2. 活動模組 (Events)
// ==========================================

// 2.1 取得所有活動列表 (公開 Public)
app.get('/api/events', async (req, res) => {
  try {
    const searchQuery = req.query.search || '';
    const events = await getAllEvents(searchQuery, database);
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

    const event = await getEventById(eventId, database);
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
  requireRole(['admin', 'event_manager'], id => auth.me(id)),
  async (req, res) => {
    try {
      const newEvent = await createEvent(req.body, req.user, database);
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

app.post('/api/events/:id/register',authenticateToken,authRoute(async(req,res)=>{
 const data=await registerForEvent(req.user.id,req.params.id,database);
 res.status(201).json({message:'報名成功',data});
}));

// 3.2 查看自己的報名紀錄 (需登入)
app.get('/api/users/me/registrations', authenticateToken, async (req, res) => {
  try {
    const result = await getMyRegistrations(req.user.id, database);
    res.json(result);
  } catch (error) {
    console.error('查詢個人報名紀錄失敗：', error.message);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// 3.3 管理者查看特定活動的正式與取消名單 (US-08)
function privateResponse(req, res, next) {
  res.set('Cache-Control', 'no-store');
  next();
}

app.get('/api/manage/events', privateResponse, authenticateToken, async (req, res) => {
  try {
    res.json(await getManagedEvents(req.user, database));
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

      const result = await getEventRegistrations(eventId, req.user, database, req.query.status);
      res.json(result);
    } catch (error) {
      const status = error.statusCode || 500;
      res.status(status).json({ error: status >= 500 ? '查詢活動名單失敗，請稍後再試' : error.message });
    }
  }
);

// 全域錯誤處理 (符合統一錯誤回傳格式: { "error": "..." })
app.use((err, req, res, next) => {

  const status = err.statusCode || err.status || 500;
  res.status(status).json({
    error: status >= 500 ? '伺服器內部錯誤' : err.message || '請求格式錯誤'
  });
});

return app;
}
const app=createApp();
const PORT = Number(process.env.PORT || 8000);
const HOST = process.env.HOST || '127.0.0.1';

// 僅在直接透過 node index.js 啟動時才監聽 port
if (require.main === module) {
  config();
  const server = app.listen(PORT, HOST, () => {
    console.log(`後端已啟動：http://${HOST}:${server.address().port}`);
  });
}

module.exports = app;

module.exports.createApp = createApp;

// 本機測試用後端：活動列表、詳情、搜尋、分類篩選、建立／編輯活動（不含登入與報名）
// 資料庫連線設定讀取 .env 裡的 PGHOST、PGPORT、PGDATABASE、PGUSER、PGPASSWORD
require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool(); // 自動使用 PG* 環境變數

const EVENT_COLUMNS = 'id, title, description, location, category, starts_at, ends_at, created_at';

// ===== 活動分類（唯一來源）=====
// 修改允許值時，必須同步修改：
//   1. db/migrations 的 CHECK 限制（新增一支 migration）
//   2. docs/event-category-spec.md
// 前端不寫死分類，一律透過 GET /api/categories 取得。
const CATEGORIES = [
  { value: 'lecture', label: '講座' },
  { value: 'club', label: '社團' },
  { value: 'sports', label: '體育' },
  { value: 'other', label: '其他' }
];
const CATEGORY_VALUES = new Set(CATEGORIES.map(c => c.value));

// ===== 欄位驗證 =====
const LIMITS = { title: 100, description: 2000, location: 100 };

function validateEvent(body) {
  const errors = {};
  const data = {};
  const input = body && typeof body === 'object' ? body : {};

  for (const field of ['title', 'description', 'location']) {
    const value = input[field];
    if (value !== undefined && value !== null && typeof value !== 'string') {
      errors[field] = '必須是文字';
      continue;
    }
    data[field] = (value || '').trim();
    if (field !== 'description' && data[field] === '') errors[field] = '必填';
    else if (data[field].length > LIMITS[field]) errors[field] = `不可超過 ${LIMITS[field]} 字`;
  }

  if (typeof input.category !== 'string' || input.category === '') {
    errors.category = '必填';
  } else if (!CATEGORY_VALUES.has(input.category)) {
    errors.category = `不允許的分類，可用值：${[...CATEGORY_VALUES].join('、')}`;
  } else {
    data.category = input.category;
  }

  for (const field of ['starts_at', 'ends_at']) {
    const value = input[field];
    const time = typeof value === 'string' ? Date.parse(value) : NaN;
    if (!value) errors[field] = '必填';
    else if (Number.isNaN(time)) errors[field] = '時間格式錯誤，請用 ISO 8601（例：2026-12-01T14:00:00+08:00）';
    else data[field] = new Date(time).toISOString();
  }
  if (data.starts_at && data.ends_at && data.ends_at <= data.starts_at) {
    errors.ends_at = '結束時間必須晚於開始時間';
  }

  return { data, errors, ok: Object.keys(errors).length === 0 };
}

function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// LIKE 的 % 與 _ 是萬用字元，使用者輸入時要跳脫，搜尋「100%」才不會變成任意比對
const escapeLike = text => text.replace(/[\\%_]/g, '\\$&');

// ===== API =====

// GET /api/categories：分類清單（前端按鈕與下拉選單都從這裡取）
app.get('/api/categories', (req, res) => {
  res.json({ data: CATEGORIES });
});

// GET /api/events?search=關鍵字&category=分類
// - search：比對活動名稱與說明（不分大小寫）；空白則不篩選
// - category：分類值；空白或 all 則不篩選；不在允許值內回 400
// - 兩者同時提供時為 AND
app.get('/api/events', async (req, res) => {
  const q = String(req.query.search || req.query.q || '').trim();
  const rawCategory = String(req.query.category || '').trim();
  const category = rawCategory === 'all' ? '' : rawCategory;

  if (category && !CATEGORY_VALUES.has(category)) {
    return res.status(400).json({ error: '不允許的分類', fields: { category: `可用值：${[...CATEGORY_VALUES].join('、')}` } });
  }

  try {
    const { rows } = await pool.query(
      `SELECT ${EVENT_COLUMNS}
         FROM events
        WHERE ($1 = '' OR title ILIKE '%' || $1 || '%' OR description ILIKE '%' || $1 || '%')
          AND ($2 = '' OR category = $2)
        ORDER BY starts_at ASC, id ASC`,
      [escapeLike(q), category]
    );
    res.json({ data: rows });
  } catch (err) {
    console.error('查詢活動失敗：', err.message);
    res.status(500).json({ error: '伺服器錯誤，請確認資料庫連線設定' });
  }
});

// GET /api/events/:id
app.get('/api/events/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json({ error: '找不到該活動' });
  try {
    const { rows } = await pool.query(`SELECT ${EVENT_COLUMNS} FROM events WHERE id = $1`, [id]);
    if (rows.length === 0) return res.status(404).json({ error: '找不到該活動' });
    res.json(rows[0]);
  } catch (err) {
    console.error('取得活動詳情失敗：', err.message);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// TODO（登入階段）：POST / PUT 應只允許主辦單位帳號呼叫，
// 之後在這兩個路由前加上驗證 JWT 的 middleware。

// POST /api/events：建立活動
app.post('/api/events', async (req, res) => {
  const { data, errors, ok } = validateEvent(req.body);
  if (!ok) return res.status(400).json({ error: '欄位驗證失敗', fields: errors });
  try {
    const { rows } = await pool.query(
      `INSERT INTO events (title, description, location, category, starts_at, ends_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${EVENT_COLUMNS}`,
      [data.title, data.description, data.location, data.category, data.starts_at, data.ends_at]
    );
    res.status(201).location(`/api/events/${rows[0].id}`).json(rows[0]);
  } catch (err) {
    console.error('建立活動失敗：', err.message);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// PUT /api/events/:id：編輯活動（整筆取代，所有欄位都要送）
app.put('/api/events/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json({ error: '找不到該活動' });
  const { data, errors, ok } = validateEvent(req.body);
  if (!ok) return res.status(400).json({ error: '欄位驗證失敗', fields: errors });
  try {
    const { rows } = await pool.query(
      `UPDATE events
          SET title = $1, description = $2, location = $3, category = $4, starts_at = $5, ends_at = $6
        WHERE id = $7
        RETURNING ${EVENT_COLUMNS}`,
      [data.title, data.description, data.location, data.category, data.starts_at, data.ends_at, id]
    );
    if (rows.length === 0) return res.status(404).json({ error: '找不到該活動' });
    res.json(rows[0]);
  } catch (err) {
    console.error('編輯活動失敗：', err.message);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// 送來的 JSON 格式錯誤時回 400，而不是 Express 預設的 HTML 錯誤頁
app.use('/api', (err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON 格式錯誤' });
  next(err);
});

// 順便提供前端頁面：開 http://localhost:3000 即可
const frontendDir = path.join(__dirname, '..', '前端');
app.get('/', (req, res) => res.sendFile(path.join(frontendDir, 'Registration System.html')));
app.use(express.static(frontendDir));

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, err => {
    if (err) {
      if (err.code === 'EADDRINUSE') {
        console.error(`啟動失敗：${port} 埠已被其他程式占用，請先關閉它，或在 .env 修改 PORT。`);
      } else {
        console.error('啟動失敗：', err);
      }
      process.exit(1);
    }
    console.log(`Server running on http://localhost:${port}`);
  });
}

module.exports = { app, pool, validateEvent, CATEGORIES };

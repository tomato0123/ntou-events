// 本機測試用後端：活動列表、詳情、搜尋（不含登入與報名）
// 資料庫連線設定讀取 .env 裡的 PGHOST、PGPORT、PGDATABASE、PGUSER、PGPASSWORD
require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());

const pool = new Pool(); // 自動使用 PG* 環境變數

const EVENT_COLUMNS = 'id, title, description, location, starts_at, ends_at, created_at';

// GET /api/events?search=關鍵字（比對活動名稱與說明；空白則回傳全部）
app.get('/api/events', async (req, res) => {
  try {
    const q = String(req.query.search || req.query.q || '').trim();
    const { rows } = await pool.query(
      `SELECT ${EVENT_COLUMNS}
         FROM events
        WHERE $1 = '' OR title ILIKE '%' || $1 || '%' OR description ILIKE '%' || $1 || '%'
        ORDER BY starts_at ASC`,
      [q]
    );
    res.json({ data: rows });
  } catch (err) {
    console.error('查詢活動失敗：', err.message);
    res.status(500).json({ error: '伺服器錯誤，請確認資料庫連線設定' });
  }
});

// GET /api/events/:id
app.get('/api/events/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).json({ error: '找不到該活動' });
  try {
    const { rows } = await pool.query(`SELECT ${EVENT_COLUMNS} FROM events WHERE id = $1`, [id]);
    if (rows.length === 0) return res.status(404).json({ error: '找不到該活動' });
    res.json(rows[0]);
  } catch (err) {
    console.error('取得活動詳情失敗：', err.message);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// 順便提供前端頁面：開 http://localhost:3000 即可
const frontendDir = path.join(__dirname, '..', '前端');
app.get('/', (req, res) => res.sendFile(path.join(frontendDir, 'Registration System.html')));
app.use(express.static(frontendDir));

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
// 明確啟動的獨立 UI 測試環境。只綁定 loopback，不讀 .env、不連 PostgreSQL。
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
process.env.USE_MOCK_DB = 'true';
process.env.JWT_SECRET = randomBytes(32).toString('hex');
const { mockEvents } = require('../event-service');
const { mockUsers, mockRegistrations } = require('../registration-service');
const { generateToken } = require('../auth-middleware');
const root = path.join(__dirname, '../..');
const app = express();
app.use(express.json());
const accounts = {
  owner: { id: 10, role: 'event_manager' }, other: { id: 20, role: 'event_manager' },
  admin: { id: 30, role: 'admin' }, user: { id: 40, role: 'user' }, empty: { id: 50, role: 'event_manager' }
};
mockUsers.push(...Object.values(accounts),
  { id: 101, role: 'user', name: '王小明（測試）', email: 'ming@example.test', campus_identity: 'student', gender: '男' },
  { id: 102, role: 'user', name: '<img src=x onerror=alert(1)>', email: 'long-name-for-layout-testing@example.test', campus_identity: 'teacher', gender: null },
  { id: 103, role: 'user', name: null, email: 'staff@example.test', campus_identity: 'staff', gender: '女' });
const common = { location: '電資大樓 302', starts_at: '2030-01-01T01:00:00Z', ends_at: '2030-01-01T04:00:00Z' };
mockEvents.push(
  { ...common, id: 201, title: '海洋永續講座（測試）', manager_id: 10, description:'測一個天崩地裂'},
  { ...common, id: 202, title: '校園交流工作坊・空名單（測試）', manager_id: 10 },
  { ...common, id: 203, title: '其他管理者的活動（測試）', manager_id: 20 },
  { ...common, id: 204, title: '尚未指定負責人的活動（測試）', manager_id: null });
mockRegistrations.push(
  { id: 1001, event_id: 201, user_id: 101, status: 'registered', registered_at: '2029-12-01T00:00:00Z' },
  { id: 1002, event_id: 201, user_id: 102, status: 'cancelled', registered_at: '2029-12-01T01:00:00Z' },
  { id: 1003, event_id: 201, user_id: 103, status: 'registered', registered_at: '2029-12-01T02:00:00Z' });
let mode = 'normal';
app.post('/__test__/session', (req, res) => {
  const user = accounts[req.body.role];
  res.set('Cache-Control', 'no-store').json({ token: user ? generateToken(user) : '' });
});
app.post('/__test__/mode', (req, res) => {
  mode = req.body.mode;
  res.json({ ok: true });
});
app.get('/api-config.js', (req, res) => res.type('js').send('window.NtouConfig = Object.freeze({ apiBase: "/api" });'));
app.get('/__test__/controls.js', (req, res) => res.sendFile(path.join(__dirname, 'ui06-controls.js')));
app.get('/__test__/runner.js', (req, res) => res.sendFile(path.join(__dirname, 'ui06-runner.js')));
app.get('/__test__/runner', (req, res) => res.type('html').send('<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>UI-06 前端驗收</title><h1>UI-06 前端驗收（獨立測試環境）</h1><pre id="results">測試執行中…</pre><iframe id="subject" title="UI-06 測試頁面" src="/manager.html" style="width:100%;height:750px"></iframe><script src="/__test__/runner.js"></script></html>'));
app.get('/preview', (req, res) => res.type('html').send(fs.readFileSync(path.join(root, 'manager.html'), 'utf8').replace('<script src="manager.js"', '<script src="/__test__/controls.js" defer></script><script src="manager.js"')));
app.use('/api', async (req, res, next) => {
  const requestedMode = mode;
  if (requestedMode === 'slow') await new Promise(resolve => setTimeout(resolve, 700));
  if (requestedMode === 'error') return res.status(500).json({ error: 'fixture' });
  if (req.path.endsWith('/registrations')) {
    if (requestedMode === 'forbidden') return res.status(403).json({ error: 'fixture' });
    if (requestedMode === 'missing') return res.status(404).json({ error: 'fixture' });
    if (requestedMode === 'expired') return res.status(401).json({ error: 'fixture' });
    if (requestedMode === 'malformed') return res.json({ data: null });
  }
  next();
});
app.use(require('../index'));
if (require.main === module) {
  app.listen(8126, '127.0.0.1', () => console.log('UI-06 測試預覽：http://127.0.0.1:8126/preview\n前端驗收：http://127.0.0.1:8126/__test__/runner'));
}

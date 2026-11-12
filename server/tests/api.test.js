const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createApp } = require('../index');

async function startApi(t, database) {
  const authenticate = (req, _res, next) => {
    req.user = { id: 7, role: 'user' };
    next();
  };
  const server = createApp({ database, authenticate }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('POST /api/events/:id/register 回傳規格指定的 201 格式', async t => {
  const registeredAt = new Date('2026-10-21T12:30:00Z');
  const client = {
    async query(text, values) {
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return {};
      if (text.startsWith('SELECT id FROM events')) return { rowCount: 1, rows: [{ id: values[0] }] };
      return {
        rows: [{ id: 5001, user_id: values[0], event_id: values[1], status: 'registered', registered_at: registeredAt }]
      };
    },
    release() {}
  };
  const baseUrl = await startApi(t, { async connect() { return client; } });

  const response = await fetch(`${baseUrl}/api/events/101/register`, { method: 'POST' });
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.message, '報名成功');
  assert.equal(body.data.user_id, 7);
  assert.equal(body.data.event_id, 101);
  assert.equal(body.data.status, 'registered');
});

test('GET /api/users/me/registrations 沒有紀錄時回傳 data 空陣列', async t => {
  const database = { async query() { return { rows: [] }; } };
  const baseUrl = await startApi(t, database);

  const response = await fetch(`${baseUrl}/api/users/me/registrations`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, { data: [] });
});

test('API 錯誤回應只包含 error 訊息', async t => {
  const baseUrl = await startApi(t, { async query() { return { rows: [] }; } });
  const response = await fetch(`${baseUrl}/api/not-found`);

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: '找不到 API 路徑' });
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { getManagedEvents, mockUsers, mockRegistrations } = require('../registration-service');
const { mockEvents } = require('../event-service');

delete process.env.USE_MOCK_DB;
for (const role of ['event_manager', 'admin']) {
  test(`管理活動 SQL：${role} 使用目前角色及參數化歸屬條件`, async () => {
    let calls = 0;
    const result = await getManagedEvents({ id: 10, role: 'user' }, { async query(sql, values) {
      calls++;
      if (calls === 1) {
        assert.match(sql, /SELECT id, role FROM users/);
        assert.deepEqual(values, [10]);
        return { rows: [{ id: 10, role }] };
      }
      assert.match(sql, /WHERE \(\$1::boolean OR manager_id = \$2\)/);
      assert.match(sql, /ORDER BY starts_at ASC, id ASC/);
      assert.deepEqual(values, [role === 'admin', 10]);
      return { rows: [{ id: 100, title: '測試活動', location: '測試場地',
        starts_at: new Date('2030-01-01T00:00:00Z'), ends_at: new Date('2030-01-01T01:00:00Z'),
        manager_id: 10, internal: 'not returned' }] };
    } });
    assert.equal(calls, 2);
    assert.deepEqual(result, { data: [{ id: 100, title: '測試活動', location: '測試場地',
      starts_at: '2030-01-01T00:00:00.000Z', ends_at: '2030-01-01T01:00:00.000Z' }] });
  });
}

test('管理活動：撤權／刪除帳號不得查詢活動，資料庫失敗不使用舊角色', async () => {
  for (const [rows, statusCode] of [[[{ id: 10, role: 'user' }], 403], [[], 401]]) {
    let calls = 0;
    await assert.rejects(getManagedEvents({ id: 10, role: 'admin' }, { async query(sql) {
      calls++;
      assert.match(sql, /FROM users/);
      return { rows };
    } }), { statusCode });
    assert.equal(calls, 1);
  }
  await assert.rejects(getManagedEvents({ id: 10, role: 'admin' }, { async query() {
    throw new Error('unavailable');
  } }), /unavailable/);
});

test('管理活動 HTTP：角色、本人／他人／NULL 活動、撤權、快取及靜態檔案隔離', async t => {
  process.env.USE_MOCK_DB = 'true';
  mockUsers.push({ id: 10, role: 'event_manager' }, { id: 20, role: 'event_manager' },
    { id: 30, role: 'admin' }, { id: 40, role: 'user' }, { id: 50, role: 'event_manager' });
  const baseEvent = { title: '測試', location: '測試室', starts_at: '2030-01-01T00:00:00Z', ends_at: '2030-01-01T01:00:00Z' };
  mockEvents.push({ ...baseEvent, id: 102, manager_id: 20 }, { ...baseEvent, id: 101, manager_id: 10 }, { ...baseEvent, id: 103, manager_id: null });
  const { generateToken } = require('../auth-middleware');
  const app = require('../index');
  const server = app.listen(0, '127.0.0.1');
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    delete process.env.USE_MOCK_DB;
    mockUsers.length = mockEvents.length = mockRegistrations.length = 0;
  });
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = id => id ? { Authorization: `Bearer ${generateToken({ id, role: 'admin' })}` } : {};
  for (const [id, expected, ids] of [[10, 200, [101]], [20, 200, [102]], [30, 200, [101, 102, 103]],
    [40, 403], [50, 200, []], [999, 401], [null, 401]]) {
    const response = await fetch(`${base}/api/manage/events`, { headers: headers(id) });
    assert.equal(response.status, expected);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const json = await response.json();
    if (expected === 200) assert.deepEqual(json.data.map(e => e.id), ids);
    else assert.deepEqual(Object.keys(json), ['error']);
  }
  const oldHeaders = headers(10);
  mockUsers[0].role = 'user';
  assert.equal((await fetch(`${base}/api/manage/events`, { headers: oldHeaders })).status, 403);
  assert.equal((await fetch(`${base}/api/events/101/registrations`, { headers: oldHeaders })).headers.get('cache-control'), 'no-store');
  for (const file of ['/', '/manager.html', '/manager.js', '/manager.css', '/auth-session.js', '/api-config.js']) {
    assert.equal((await fetch(base + file)).status, 200);
  }
  assert.match(await (await fetch(base + '/api-config.js')).text(), /apiBase: "\/api"/);
  for (const file of ['/server/.env', '/.git/config', '/server/index.js', '/server/tests/ui06-preview.js', '/__test__/session']) {
    assert.equal((await fetch(base + file)).status, 404);
  }
});

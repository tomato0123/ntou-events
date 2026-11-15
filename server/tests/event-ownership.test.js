const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createEvent, mockEvents } = require('../event-service');
const { getEventRegistrations, mockRegistrations } = require('../registration-service');

// 本檔不連線真實資料庫；SQL 路徑使用注入的 pool，HTTP 路徑使用記憶體資料。
delete process.env.USE_MOCK_DB;
const owner = { id: 10, role: 'event_manager' };
const other = { id: 20, role: 'event_manager' };
const admin = { id: 30, role: 'admin' };
const eventInput = {
  title: 'Ownership fixture', description: 'Test', location: 'Test room',
  starts_at: '2030-01-01T10:00:00Z', ends_at: '2030-01-01T12:00:00Z',
  manager_id: other.id
};

test('SQL 建立活動忽略前端指定負責人，保存登入者 ID', async () => {
  const database = { async query(sql, values) {
    assert.match(sql, /manager_id/);
    assert.equal(values[5], owner.id);
    return { rows: [{ id: 101, title: values[0], description: values[1],
      location: values[2], starts_at: values[3], ends_at: values[4],
      manager_id: values[5], created_at: new Date() }] };
  } };
  const event = await createEvent(eventInput, owner, database);
  assert.equal(event.manager_id, owner.id);
});

test('無有效登入者 ID 不建立活動', async () => {
  await assert.rejects(createEvent(eventInput, { role: 'admin' }, {
    async query() { assert.fail('不應寫入資料庫'); }
  }), { statusCode: 401 });
});

for (const scenario of [
  { name: '本人', user: owner, manager: 10, status: 200 },
  { name: '其他管理者', user: other, manager: 10, status: 403 },
  { name: '管理員查看他人活動', user: admin, manager: 10, status: 200 },
  { name: '未指定負責人的活動拒絕管理者', user: owner, manager: null, status: 403 },
  { name: '未指定負責人的活動允許管理員', user: admin, manager: null, status: 200 },
  { name: '一般使用者即使是負責人仍拒絕', user: { id: 10, role: 'user' }, manager: 10, status: 403 },
  { name: '未登入', user: null, manager: 10, status: 401 },
  { name: '不存在的活動', user: admin, missing: true, status: 404 }
]) {
  test(`SQL 名單權限：${scenario.name}`, async () => {
    let rosterQueries = 0;
    const database = { async query(sql, values) {
      assert.equal(values[0], 101);
      if (sql.includes('FROM events')) {
        assert.match(sql, /manager_id/);
        return { rows: scenario.missing ? [] : [{ id: 101, title: 'Test', manager_id: scenario.manager }] };
      }
      assert.match(sql, /FROM registrations/);
      rosterQueries++;
      return { rows: [] };
    } };
    if (scenario.status === 200) {
      const result = await getEventRegistrations(101, scenario.user, database);
      assert.equal(result.summary.total_count, 0);
      assert.equal(rosterQueries, 1);
    } else {
      await assert.rejects(getEventRegistrations(101, scenario.user, database), { statusCode: scenario.status });
      assert.equal(rosterQueries, 0, '拒絕時不得查詢名單');
    }
  });
}

test('HTTP：建立者綁定及不同角色／舊活動／不存在活動的歸屬限制', async t => {
  process.env.USE_MOCK_DB = 'true';
  const app = require('../index');
  const { generateToken } = require('../auth-middleware');
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    delete process.env.USE_MOCK_DB;
    mockEvents.length = 0;
    mockRegistrations.length = 0;
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const headers = user => ({ 'Content-Type': 'application/json',
    ...(user ? { Authorization: `Bearer ${generateToken(user)}` } : {}) });
  const created = await fetch(`${base}/events`, {
    method: 'POST', headers: headers(owner), body: JSON.stringify(eventInput)
  });
  assert.equal(created.status, 201);
  const event = (await created.json()).data;
  assert.equal(event.manager_id, owner.id);
  mockRegistrations.push({ id: 1, event_id: event.id, user_id: 50, status: 'registered' });
  for (const [user, expected] of [[owner, 200], [other, 403], [admin, 200],
    [{ id: 10, role: 'user' }, 403], [null, 401]]) {
    const response = await fetch(`${base}/events/${event.id}/registrations`, { headers: headers(user) });
    assert.equal(response.status, expected);
    const body = await response.json();
    if (expected === 200) assert.equal(body.summary.confirmed_count, 1);
    else assert.deepEqual(Object.keys(body), ['error']);
  }
  mockEvents.push({ id: 999, manager_id: null });
  for (const [id, user, expected] of [[999, owner, 403], [999, admin, 200], [998, admin, 404]]) {
    const response = await fetch(`${base}/events/${id}/registrations`, { headers: headers(user) });
    assert.equal(response.status, expected);
  }
});

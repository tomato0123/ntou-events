const test = require('node:test');
const assert = require('node:assert/strict');
const { setEventManagerPermission } = require('../user-role-service');
const { createSetEventManagerPermissionHandler } = require('../index');

function response() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

function roleDatabase(returnedRole) {
  const calls = [];
  return {
    calls,
    database: {
      async query(text, values) {
        calls.push({ text, values });
        return {
          rowCount: 1,
          rows: [{
            id: values[0],
            name: '測試使用者',
            email: 'student@ntou.edu.tw',
            role: returnedRole,
            campus_identity: 'student'
          }]
        };
      }
    }
  };
}

test('US-06：系統可授予活動管理者權限', async () => {
  const fixture = roleDatabase('event_manager');
  const result = await setEventManagerPermission(
    7,
    'event_manager',
    fixture.database
  );

  assert.equal(result.role, 'event_manager');
  assert.deepEqual(fixture.calls[0].values, [7, 'event_manager']);
  assert.match(fixture.calls[0].text, /role <> 'admin'/);
});

test('US-06：系統可撤銷活動管理者權限', async () => {
  const fixture = roleDatabase('user');
  const result = await setEventManagerPermission(7, 'user', fixture.database);

  assert.equal(result.role, 'user');
  assert.deepEqual(fixture.calls[0].values, [7, 'user']);
});

test('US-06：拒絕設定 admin 或其他角色', async () => {
  let queried = false;
  const database = {
    async query() {
      queried = true;
      return { rowCount: 0, rows: [] };
    }
  };

  await assert.rejects(
    setEventManagerPermission(7, 'admin', database),
    error => error.statusCode === 400 &&
      error.message === '角色只能是 user 或 event_manager'
  );
  assert.equal(queried, false);
});

test('US-06：系統管理員帳號本身不可降權', async () => {
  const database = {
    async query() {
      return { rowCount: 0, rows: [] };
    }
  };

  await assert.rejects(
    setEventManagerPermission(99, 'user', database),
    error => error.statusCode === 404 &&
      error.message === '找不到可變更權限的使用者'
  );
});

test('US-06 API handler 回傳授予與撤銷的明確訊息', async () => {
  const grantHandler = createSetEventManagerPermissionHandler(
    async () => ({ id: 7, role: 'event_manager' })
  );
  const revokeHandler = createSetEventManagerPermissionHandler(
    async () => ({ id: 7, role: 'user' })
  );
  const grantResponse = response();
  const revokeResponse = response();

  await grantHandler(
    { params: { id: '7' }, body: { role: 'event_manager' } },
    grantResponse
  );
  await revokeHandler(
    { params: { id: '7' }, body: { role: 'user' } },
    revokeResponse
  );

  assert.equal(grantResponse.body.message, '已授予活動管理者權限');
  assert.equal(revokeResponse.body.message, '已撤銷活動管理者權限');
});

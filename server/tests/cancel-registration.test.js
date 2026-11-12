const test = require('node:test');
const assert = require('node:assert/strict');
const { cancelMyRegistration } = require('../registration-service');
const { createCancelRegistrationHandler } = require('../index');

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

test('只取消登入者本人的有效報名', async () => {
  const cancelled = {
    id: 51,
    user_id: 7,
    event_id: 101,
    status: 'cancelled',
    registered_at: new Date('2026-11-01T08:00:00Z')
  };
  const calls = [];
  const database = {
    async query(text, values) {
      calls.push({ text, values });
      return { rowCount: 1, rows: [cancelled] };
    }
  };

  const result = await cancelMyRegistration(7, 51, database);

  assert.deepEqual(result, cancelled);
  assert.deepEqual(calls[0].values, [51, 7]);
  assert.match(calls[0].text, /WHERE id = \$1/);
  assert.match(calls[0].text, /user_id = \$2/);
  assert.match(calls[0].text, /status = 'registered'/);
  assert.match(calls[0].text, /SET status = 'cancelled'/);
});

test('別人的、已取消或不存在的報名都不能取消', async () => {
  const database = {
    async query() {
      return { rowCount: 0, rows: [] };
    }
  };

  await assert.rejects(
    cancelMyRegistration(7, 99, database),
    error => error.statusCode === 404 &&
      error.message === '找不到可取消的本人有效報名'
  );
});

test('報名編號格式錯誤時不查詢資料庫', async () => {
  let queried = false;
  const database = {
    async query() {
      queried = true;
      return { rowCount: 0, rows: [] };
    }
  };

  await assert.rejects(
    cancelMyRegistration(7, 'abc', database),
    error => error.statusCode === 400 && error.message === '報名編號必須是正整數'
  );
  assert.equal(queried, false);
});

test('取消 API handler 使用登入者編號並回傳成功格式', async () => {
  const expected = {
    id: 51,
    user_id: 7,
    event_id: 101,
    status: 'cancelled'
  };
  let received;
  const handler = createCancelRegistrationHandler(async (userId, registrationId) => {
    received = { userId, registrationId };
    return expected;
  });
  const res = response();

  await handler({ user: { id: 7 }, params: { id: '51' } }, res);

  assert.deepEqual(received, { userId: 7, registrationId: '51' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    message: '取消報名成功',
    data: expected
  });
});

test('取消 API handler 保留可預期的錯誤狀態與格式', async () => {
  const handler = createCancelRegistrationHandler(async () => {
    const error = new Error('找不到可取消的本人有效報名');
    error.statusCode = 404;
    throw error;
  });
  const res = response();

  await handler({ user: { id: 7 }, params: { id: '99' } }, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: '找不到可取消的本人有效報名' });
});

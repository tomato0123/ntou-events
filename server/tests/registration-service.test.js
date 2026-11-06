const test = require('node:test');
const assert = require('node:assert/strict');
const {
  registerForEvent,
  getMyRegistrations
} = require('../registration-service');

function transactionDatabase(responses) {
  const calls = [];
  const client = {
    async query(text, values) {
      calls.push({ text, values });
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return {};
      const response = responses.shift();
      if (response instanceof Error) throw response;
      return response;
    },
    release() {
      calls.push({ text: 'RELEASE' });
    }
  };
  return { database: { async connect() { return client; } }, calls };
}

test('報名成功時新增 registered 紀錄並提交交易', async () => {
  const registeredAt = new Date('2026-10-21T12:30:00Z');
  const fixture = transactionDatabase([
    { rowCount: 1, rows: [{ id: 101 }] },
    { rows: [{ id: 5001, user_id: 1, event_id: 101, status: 'registered', registered_at: registeredAt }] }
  ]);

  const result = await registerForEvent(1, 101, fixture.database);

  assert.deepEqual(result, {
    id: 5001,
    user_id: 1,
    event_id: 101,
    status: 'registered',
    registered_at: registeredAt
  });
  assert.equal(fixture.calls[0].text, 'BEGIN');
  assert.match(fixture.calls[2].text, /INSERT INTO registrations/);
  assert.equal(fixture.calls[3].text, 'COMMIT');
  assert.equal(fixture.calls.at(-1).text, 'RELEASE');
});

test('找不到活動時回傳 404 並回滾', async () => {
  const fixture = transactionDatabase([{ rowCount: 0, rows: [] }]);

  await assert.rejects(
    registerForEvent(1, 999, fixture.database),
    error => error.status === 404 && error.message === '找不到該活動'
  );
  assert.equal(fixture.calls.at(-2).text, 'ROLLBACK');
});

test('資料庫唯一索引擋下重複有效報名並轉成 409', async () => {
  const duplicate = Object.assign(new Error('duplicate key'), { code: '23505' });
  const fixture = transactionDatabase([
    { rowCount: 1, rows: [{ id: 101 }] },
    duplicate
  ]);

  await assert.rejects(
    registerForEvent(1, 101, fixture.database),
    error => error.status === 409 && error.message === '您已報名過此活動，請勿重複報名'
  );
  assert.equal(fixture.calls.at(-2).text, 'ROLLBACK');
});

test('本人報名結果包含 registered 與 cancelled 並保留活動資訊', async () => {
  const rows = [
    {
      id: 5002, user_id: 1, event_id: 101, status: 'registered',
      registered_at: new Date('2026-10-21T14:00:00Z'), title: '海大黑客松 2026',
      location: '電資大樓 302', starts_at: new Date('2026-11-20T09:00:00Z'),
      ends_at: new Date('2026-11-20T18:00:00Z')
    },
    {
      id: 5001, user_id: 1, event_id: 101, status: 'cancelled',
      registered_at: new Date('2026-10-21T12:30:00Z'), title: '海大黑客松 2026',
      location: '電資大樓 302', starts_at: new Date('2026-11-20T09:00:00Z'),
      ends_at: new Date('2026-11-20T18:00:00Z')
    }
  ];
  const calls = [];
  const database = {
    async query(text, values) {
      calls.push({ text, values });
      return { rows };
    }
  };

  const result = await getMyRegistrations(1, database);

  assert.deepEqual(result.map(item => item.status), ['registered', 'cancelled']);
  assert.equal(result[0].event.title, '海大黑客松 2026');
  assert.deepEqual(calls[0].values, [1]);
  assert.match(calls[0].text, /ORDER BY r\.registered_at DESC, r\.id DESC/);
});

test('沒有報名紀錄時回傳空陣列', async () => {
  const database = { async query() { return { rows: [] }; } };
  assert.deepEqual(await getMyRegistrations(1, database), []);
});

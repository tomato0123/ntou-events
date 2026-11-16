const test = require('node:test');
const assert = require('node:assert/strict');
const {
  registerForEvent,
  cancelMyRegistration
} = require('../registration-service');
const {
  createRegisterForEventHandler,
  createCancelRegistrationHandler
} = require('../index');

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

function transactionDatabase(responses) {
  const calls = [];
  const client = {
    async query(text, values) {
      calls.push({ text, values });
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return {};
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return next;
    },
    release() {
      calls.push({ text: 'RELEASE' });
    }
  };
  return {
    calls,
    database: {
      async connect() {
        return client;
      }
    }
  };
}

test('US-03：登入者可報名存在的活動', async () => {
  const registeredAt = new Date('2026-11-16T08:00:00Z');
  const fixture = transactionDatabase([
    { rowCount: 1, rows: [{ id: 101 }] },
    {
      rowCount: 1,
      rows: [{
        id: 501,
        user_id: 7,
        event_id: 101,
        status: 'registered',
        registered_at: registeredAt
      }]
    }
  ]);

  const result = await registerForEvent(7, 101, fixture.database);

  assert.equal(result.status, 'registered');
  assert.equal(result.user_id, 7);
  assert.equal(result.event_id, 101);
  assert.equal(fixture.calls[0].text, 'BEGIN');
  assert.match(fixture.calls[2].text, /INSERT INTO registrations/);
  assert.equal(fixture.calls[3].text, 'COMMIT');
  assert.equal(fixture.calls.at(-1).text, 'RELEASE');
});

test('US-03：重複有效報名回傳 409 並回滾', async () => {
  const duplicate = Object.assign(new Error('duplicate key'), { code: '23505' });
  const fixture = transactionDatabase([
    { rowCount: 1, rows: [{ id: 101 }] },
    duplicate
  ]);

  await assert.rejects(
    registerForEvent(7, 101, fixture.database),
    error => error.statusCode === 409 &&
      error.message === '您已報名過此活動，請勿重複報名'
  );
  assert.equal(fixture.calls.at(-2).text, 'ROLLBACK');
});

test('US-04：只取消登入者本人的有效報名', async () => {
  const calls = [];
  const database = {
    async query(text, values) {
      calls.push({ text, values });
      return {
        rowCount: 1,
        rows: [{
          id: 501,
          user_id: 7,
          event_id: 101,
          status: 'cancelled',
          registered_at: new Date('2026-11-16T08:00:00Z')
        }]
      };
    }
  };

  const result = await cancelMyRegistration(7, 501, database);

  assert.equal(result.status, 'cancelled');
  assert.deepEqual(calls[0].values, [501, 7]);
  assert.match(calls[0].text, /user_id = \$2/);
  assert.match(calls[0].text, /status = 'registered'/);
});

test('US-04：別人、已取消或不存在的報名均不可取消', async () => {
  const database = {
    async query() {
      return { rowCount: 0, rows: [] };
    }
  };

  await assert.rejects(
    cancelMyRegistration(7, 999, database),
    error => error.statusCode === 404 &&
      error.message === '找不到可取消的本人有效報名'
  );
});

test('報名與取消 API handler 使用 JWT 登入者編號', async () => {
  const received = [];
  const registerHandler = createRegisterForEventHandler(
    async (userId, eventId) => {
      received.push({ action: 'register', userId, id: eventId });
      return { id: 501, user_id: userId, event_id: Number(eventId), status: 'registered' };
    }
  );
  const cancelHandler = createCancelRegistrationHandler(
    async (userId, registrationId) => {
      received.push({ action: 'cancel', userId, id: registrationId });
      return { id: Number(registrationId), user_id: userId, event_id: 101, status: 'cancelled' };
    }
  );
  const registerResponse = response();
  const cancelResponse = response();

  await registerHandler(
    { user: { id: 7 }, params: { id: '101' } },
    registerResponse
  );
  await cancelHandler(
    { user: { id: 7 }, params: { id: '501' } },
    cancelResponse
  );

  assert.equal(registerResponse.statusCode, 201);
  assert.equal(registerResponse.body.message, '報名成功');
  assert.equal(cancelResponse.statusCode, 200);
  assert.equal(cancelResponse.body.message, '取消報名成功');
  assert.deepEqual(received, [
    { action: 'register', userId: 7, id: '101' },
    { action: 'cancel', userId: 7, id: '501' }
  ]);
});

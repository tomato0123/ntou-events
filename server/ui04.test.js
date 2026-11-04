const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const { createMyRegistrationsRouter } = require('./my-registrations-router');

const env = { NODE_ENV: 'development', UI04_LOCAL_TEST: 'true', UI04_TEST_USER_ID: '7' };
async function withServer(service, config, run) {
  const app = express();
  app.use(express.json());
  app.use('/api/users/me/registrations', createMyRegistrationsRouter(service, config));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/users/me/registrations`;
  try { await run(base); } finally { await new Promise(resolve => server.close(resolve)); }
}
const post = { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-UI04-Request': '1' }, body: '{"user_id":99}' };

test('testing identity fails closed outside explicit development mode', () => {
  assert.throws(() => createMyRegistrationsRouter({}, { ...env, NODE_ENV: 'production' }));
  assert.throws(() => createMyRegistrationsRouter({}, { ...env, UI04_TEST_USER_ID: '' }));
});
test('disabled mode rejects reads and cancellation', async () => {
  await withServer({}, {}, async base => {
    assert.equal((await fetch(base)).status, 401);
    assert.equal((await fetch(`${base}/1/cancel`, post)).status, 401);
  });
});
test('query uses backend identity, preserves empty results and marks testing', async () => {
  await withServer({ getMyRegistrations: async id => { assert.equal(id, 7); return { data: [] }; } }, env, async base => {
    const response = await fetch(`${base}?user_id=99`);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { data: [], meta: { localTest: true, userId: 7 } });
  });
});
test('cancel validates id, uses server identity and rejects cross-site requests', async () => {
  let calls = 0;
  await withServer({ cancelMyRegistration: async (user, id) => {
    calls++; assert.equal(user, 7); assert.equal(id, 5);
    return { data: { id, status: 'cancelled' } };
  } }, env, async base => {
    assert.equal((await fetch(`${base}/invalid/cancel`, post)).status, 400);
    assert.equal((await fetch(`${base}/5/cancel`, { ...post, headers: { ...post.headers, Origin: 'https://other.example' } })).status, 403);
    assert.equal((await fetch(`${base}/5/cancel`, { ...post, headers: { 'Content-Type': 'application/json' } })).status, 403);
    assert.equal((await fetch(`${base}/5/cancel`, post)).status, 200);
    assert.equal(calls, 1);
    const status = await new Promise((resolve, reject) => {
      http.get(base, { headers: { Host: 'untrusted.example' } }, response => {
        response.resume(); resolve(response.statusCode);
      }).on('error', reject);
    });
    assert.equal(status, 401);
  });
});
test('ownership, deadline and database failures return appropriate safe errors', async () => {
  for (const [code, expected] of [['NOT_FOUND', 404], ['STARTED', 409], ['XX000', 500]]) {
    const fail = async () => { throw Object.assign(new Error('secret connection details'), { code }); };
    await withServer({ cancelMyRegistration: fail, getMyRegistrations: fail }, env, async base => {
      const response = await fetch(`${base}/5/cancel`, post);
      assert.equal(response.status, expected);
      assert.ok(!(await response.text()).includes('secret'));
    });
  }
});

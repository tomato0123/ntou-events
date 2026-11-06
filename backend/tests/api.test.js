import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDatabase, seedDatabase } from '../src/database.js';
import { createApp } from '../src/app.js';

const initialTime = Date.parse('2026-10-21T12:00:00+08:00');
const password = 'Example-password-2026!';

async function fixture(t, options = {}) {
  const db = openDatabase(':memory:');
  let timestamp = initialTime;
  seedDatabase(db, timestamp);
  const server = createApp(db, { now: () => timestamp, logger: { error: value => assert.fail(JSON.stringify(value)) }, ...options });
  const listening = once(server, 'listening');
  server.listen(0, '127.0.0.1');
  await listening;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(method, path, { token, body, headers = {}, raw } = {}) {
    const response = await fetch(base + path, {
      method, signal: AbortSignal.timeout(5000),
      headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body !== undefined || raw !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      ...(raw !== undefined ? { body: raw } : body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const json = response.status === 204 ? null : await response.json();
    return { status: response.status, headers: response.headers, json, data: json?.data, error: json?.error };
  }
  let counter = 0;
  async function user(extra = {}) {
    counter++;
    const body = { name: '測試同學' + counter, studentId: 'TEST' + counter, email: `test${counter}@example.com`, department: '資訊工程學系', identity: 'student', password, ...extra };
    const response = await request('POST', '/api/auth/register', { body });
    assert.equal(response.status, 201, JSON.stringify(response.json));
    return { ...response.data, input: body };
  }
  return { db, request, user, setTime: time => { timestamp = time; } };
}

test('活動列表、詳情、搜尋、分頁與健康檢查', async t => {
  const { request } = await fixture(t);
  assert.equal((await request('GET', '/api/health')).data.status, 'ok');
  const list = await request('GET', '/api/events');
  assert.equal(list.data.total, 3);
  assert.equal(list.data.items[0].remaining, 2);
  assert.equal((await request('GET', '/api/events?q=' + encodeURIComponent('永續'))).data.total, 1);
  assert.equal((await request('GET', '/api/events?category=' + encodeURIComponent('講座'))).data.total, 1);
  assert.equal((await request('GET', '/api/events?limit=1&offset=1')).data.items.length, 1);
  assert.equal((await request('GET', '/api/events?limit=0')).status, 400);
  assert.equal((await request('GET', '/api/events?offset=-1')).status, 400);
  assert.equal((await request('GET', '/api/events/missing')).status, 404);
  assert.equal((await request('GET', '/api/events/%ZZ')).status, 400);
});

test('帳號註冊、密碼雜湊、token 雜湊與重複帳號檢查', async t => {
  const { request, user, db } = await fixture(t);
  const account = await user();
  const me = await request('GET', '/api/me', { token: account.token });
  assert.equal(me.data.id, account.user.id);
  assert.equal(me.data.password_hash, undefined);
  assert.equal(me.data.password, undefined);
  const row = db.prepare('SELECT * FROM users').get();
  assert.notEqual(row.password_hash, password);
  assert.match(row.password_hash, /^scrypt:/);
  assert.notEqual(db.prepare('SELECT token_hash FROM sessions').get().token_hash, account.token);
  const duplicateEmail = await request('POST', '/api/auth/register', { body: { ...account.input, studentId: 'OTHER', email: account.input.email.toUpperCase() } });
  assert.equal(duplicateEmail.status, 409);
  const duplicateId = await request('POST', '/api/auth/register', { body: { ...account.input, email: 'other@example.com' } });
  assert.equal(duplicateId.status, 409);
});

test('登入、錯誤密碼、登出與 session 到期', async t => {
  const { request, user, setTime } = await fixture(t);
  const account = await user();
  const login = await request('POST', '/api/auth/login', { body: { email: account.input.email.toUpperCase(), password } });
  assert.equal(login.status, 200);
  assert.equal((await request('POST', '/api/auth/login', { body: { email: account.input.email, password: 'wrong-password' } })).status, 401);
  assert.equal((await request('POST', '/api/auth/login', { body: { email: 'missing@example.com', password } })).status, 401);
  assert.equal((await request('POST', '/api/auth/logout', { token: login.data.token })).status, 200);
  assert.equal((await request('GET', '/api/me', { token: login.data.token })).status, 401);
  setTime(initialTime + 8 * 60 * 60 * 1000);
  assert.equal((await request('GET', '/api/me', { token: account.token })).error.code, 'SESSION_EXPIRED');
});

test('未登入無法報名；不能指定其他 userId 或強制正取', async t => {
  const { request, user } = await fixture(t);
  assert.equal((await request('POST', '/api/events/ocean-workshop/registrations')).status, 401);
  const account = await user();
  for (const body of [{ userId: 'other' }, { status: 'confirmed' }]) {
    assert.equal((await request('POST', '/api/events/ocean-workshop/registrations', { token: account.token, body })).status, 400);
  }
  assert.equal((await request('POST', '/api/events/missing/registrations', { token: account.token })).status, 404);
});

test('報名正取、結果查詢與防止重複報名', async t => {
  const { request, user, db } = await fixture(t);
  const { token } = await user();
  const result = await request('POST', '/api/events/ocean-workshop/registrations', { token });
  assert.equal(result.status, 201);
  assert.equal(result.data.status, 'confirmed');
  assert.equal(result.data.waitlistPosition, null);
  assert.equal(result.data.event.remaining, 1);
  const duplicate = await request('POST', '/api/events/ocean-workshop/registrations', { token });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.error.code, 'ALREADY_REGISTERED');
  assert.equal(db.prepare('SELECT count(*) AS count FROM registrations').get().count, 1);
  assert.equal((await request('GET', '/api/registrations/' + result.data.id, { token })).data.code, result.data.code);
});

test('同時 8 人報名只有 2 人正取，其餘按順序候補', async t => {
  const { request, user } = await fixture(t);
  const accounts = await Promise.all(Array.from({ length: 8 }, () => user()));
  const results = await Promise.all(accounts.map(account => request('POST', '/api/events/ocean-workshop/registrations', { token: account.token })));
  assert.ok(results.every(r => r.status === 201));
  assert.equal(results.filter(r => r.data.status === 'confirmed').length, 2);
  assert.equal(results.filter(r => r.data.status === 'waitlisted').length, 6);
  const records = await Promise.all(accounts.map(account => request('GET', '/api/registrations/me', { token: account.token })));
  const positions = records.flatMap(r => r.data.items).filter(r => r.status === 'waitlisted').map(r => r.waitlistPosition).sort((a, b) => a - b);
  assert.deepEqual(positions, [1, 2, 3, 4, 5, 6]);
  assert.equal((await request('GET', '/api/events/ocean-workshop')).data.confirmedCount, 2);
});

test('同一人同時送出多次請求，只建立一筆有效報名', async t => {
  const { request, user } = await fixture(t);
  const { token } = await user();
  const results = await Promise.all(Array.from({ length: 6 }, () => request('POST', '/api/events/ocean-workshop/registrations', { token })));
  assert.equal(results.filter(r => r.status === 201).length, 1);
  assert.equal(results.filter(r => r.status === 409).length, 5);
});

test('額滿且不開候補時拒絕報名', async t => {
  const { request, user } = await fixture(t);
  const first = await user();
  const second = await user();
  assert.equal((await request('POST', '/api/events/career-talk/registrations', { token: first.token })).status, 201);
  const response = await request('POST', '/api/events/career-talk/registrations', { token: second.token });
  assert.equal(response.status, 409);
  assert.equal(response.error.code, 'EVENT_FULL');
});

test('尚未開放、截止當下、活動開始、取消及草稿活動不能報名', async t => {
  const { request, user, db } = await fixture(t);
  const { token } = await user();
  const submit = () => request('POST', '/api/events/ocean-workshop/registrations', { token });
  db.prepare('UPDATE events SET registration_opens_at = ? WHERE id = ?').run(initialTime + 1000, 'ocean-workshop');
  assert.equal((await submit()).error.code, 'REGISTRATION_NOT_OPEN');
  db.prepare('UPDATE events SET registration_opens_at = ?, registration_closes_at = ? WHERE id = ?').run(initialTime - 1000, initialTime, 'ocean-workshop');
  assert.equal((await submit()).error.code, 'REGISTRATION_CLOSED');
  db.prepare('UPDATE events SET starts_at = ? WHERE id = ?').run(initialTime, 'ocean-workshop');
  assert.equal((await submit()).error.code, 'EVENT_STARTED');
  db.prepare("UPDATE events SET status = 'cancelled' WHERE id = 'ocean-workshop'").run();
  assert.equal((await submit()).error.code, 'EVENT_UNAVAILABLE');
  db.prepare("UPDATE events SET status = 'draft' WHERE id = 'ocean-workshop'").run();
  assert.equal((await submit()).status, 404);
  assert.equal(db.prepare('SELECT count(*) AS count FROM registrations').get().count, 0);
});

test('使用者只能查詢及取消自己的報名', async t => {
  const { request, user } = await fixture(t);
  const alice = await user();
  const bob = await user();
  const record = await request('POST', '/api/events/ocean-workshop/registrations', { token: alice.token });
  assert.equal((await request('GET', '/api/registrations/' + record.data.id, { token: bob.token })).status, 404);
  assert.equal((await request('DELETE', '/api/registrations/' + record.data.id, { token: bob.token })).status, 404);
  assert.equal((await request('GET', '/api/registrations/me', { token: bob.token })).data.total, 0);
});

test('取消正取後依序遞補；重複取消不再釋出名額', async t => {
  const { request, user } = await fixture(t);
  const accounts = await Promise.all(Array.from({ length: 4 }, () => user()));
  const records = [];
  for (const account of accounts) records.push((await request('POST', '/api/events/ocean-workshop/registrations', { token: account.token })).data);
  const cancelled = await request('DELETE', '/api/registrations/' + records[0].id, { token: accounts[0].token });
  assert.equal(cancelled.data.status, 'cancelled');
  assert.ok(cancelled.data.cancelledAt);
  const promoted = await request('GET', '/api/registrations/' + records[2].id, { token: accounts[2].token });
  assert.equal(promoted.data.status, 'confirmed');
  assert.ok(promoted.data.promotedAt);
  assert.equal((await request('GET', '/api/registrations/' + records[3].id, { token: accounts[3].token })).data.waitlistPosition, 1);
  assert.equal((await request('DELETE', '/api/registrations/' + records[0].id, { token: accounts[0].token })).status, 200);
  assert.equal((await request('GET', '/api/events/ocean-workshop')).data.confirmedCount, 2);
});

test('取消後可重新報名，並保留原本的取消紀錄', async t => {
  const { request, user } = await fixture(t);
  const { token } = await user();
  const first = await request('POST', '/api/events/ocean-workshop/registrations', { token });
  await request('DELETE', '/api/registrations/' + first.data.id, { token });
  const second = await request('POST', '/api/events/ocean-workshop/registrations', { token });
  assert.notEqual(first.data.id, second.data.id);
  assert.equal((await request('GET', '/api/registrations/me', { token })).data.total, 2);
  assert.equal((await request('GET', '/api/registrations/me?status=cancelled', { token })).data.total, 1);
  assert.equal((await request('GET', '/api/registrations/me?status=other', { token })).status, 400);
});

test('活動開始後無法取消，原報名狀態保持有效', async t => {
  const { request, user, db } = await fixture(t);
  const { token } = await user();
  const record = await request('POST', '/api/events/ocean-workshop/registrations', { token });
  db.prepare('UPDATE events SET registration_closes_at = ?, starts_at = ? WHERE id = ?').run(initialTime - 1, initialTime, 'ocean-workshop');
  const result = await request('DELETE', '/api/registrations/' + record.data.id, { token });
  assert.equal(result.error.code, 'CANCELLATION_CLOSED');
  assert.equal((await request('GET', '/api/registrations/' + record.data.id, { token })).data.status, 'confirmed');
});

test('取消候補不影響正取名額，後續候補名次會前移', async t => {
  const { request, user } = await fixture(t);
  const accounts = await Promise.all(Array.from({ length: 4 }, () => user()));
  const records = [];
  for (const account of accounts) records.push((await request('POST', '/api/events/ocean-workshop/registrations', { token: account.token })).data);
  await request('DELETE', '/api/registrations/' + records[2].id, { token: accounts[2].token });
  const event = (await request('GET', '/api/events/ocean-workshop')).data;
  assert.equal(event.confirmedCount, 2);
  assert.equal(event.waitlistedCount, 1);
  assert.equal(event.remaining, 0);
  assert.equal((await request('GET', '/api/registrations/' + records[3].id, { token: accounts[3].token })).data.waitlistPosition, 1);
});

test('報名截止後、活動開始前仍可取消並遞補既有候補', async t => {
  const { request, user, db } = await fixture(t);
  const accounts = await Promise.all(Array.from({ length: 3 }, () => user()));
  const records = [];
  for (const account of accounts) records.push((await request('POST', '/api/events/ocean-workshop/registrations', { token: account.token })).data);
  db.prepare('UPDATE events SET registration_closes_at = ? WHERE id = ?').run(initialTime - 1, 'ocean-workshop');
  assert.equal((await request('DELETE', '/api/registrations/' + records[0].id, { token: accounts[0].token })).status, 200);
  assert.equal((await request('GET', '/api/registrations/' + records[2].id, { token: accounts[2].token })).data.status, 'confirmed');
});

test('表單驗證、未知欄位、錯誤 JSON 與內容長度限制', async t => {
  const { request } = await fixture(t);
  for (const body of [[], null, { name: '' }, { role: 'admin' }]) {
    assert.equal((await request('POST', '/api/auth/register', { body })).status, 400);
  }
  assert.equal((await request('POST', '/api/auth/register', { raw: '{' })).error.code, 'INVALID_JSON');
  assert.equal((await request('POST', '/api/auth/register', { raw: '{}', headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await request('POST', '/api/auth/register', { raw: JSON.stringify({ name: 'x'.repeat(20_000) }) })).status, 413);
});

test('登入與註冊 IP 限流不影響公開活動查詢', async t => {
  const { request, user } = await fixture(t, { authLimit: 2 });
  await user(); await user();
  const response = await request('POST', '/api/auth/login', { body: { email: 'test1@example.com', password } });
  assert.equal(response.status, 429);
  assert.ok(Number(response.headers.get('retry-after')) > 0);
  assert.equal((await request('GET', '/api/events')).status, 200);
});

test('CORS 只允許設定的前端來源', async t => {
  const { request } = await fixture(t, { allowedOrigins: ['http://localhost:5173'] });
  const allowed = await request('OPTIONS', '/api/events', { headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'GET' } });
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  const denied = await request('GET', '/api/events', { headers: { Origin: 'http://untrusted.example' } });
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
});

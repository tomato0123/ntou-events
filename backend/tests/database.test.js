import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import { openDatabase, seedDatabase } from '../src/database.js';
import { RegistrationService } from '../src/registrations.js';
import { AuthService } from '../src/auth.js';

const now = Date.parse('2026-10-21T12:00:00+08:00');
function fileDatabase(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'ntou-backend-test-'));
  const filename = path.join(directory, 'test.sqlite');
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return filename;
}
function worker(filename, userId, eventId = 'ocean-workshop') {
  return new Promise((resolve, reject) => {
    const instance = new Worker(new URL('./registration-worker.js', import.meta.url), { workerData: { filename, userId, eventId, now } });
    let result;
    instance.once('message', message => { result = message; });
    instance.once('error', reject);
    instance.once('exit', code => code === 0 && result ? resolve(result) : reject(new Error(`worker exit ${code}`)));
  });
}

test('關閉及重新開啟 SQLite 後，帳號、登入 session 與報名仍保留', async t => {
  const filename = fileDatabase(t);
  let db = openDatabase(filename);
  try {
    assert.equal(seedDatabase(db, now), 3);
    const account = await new AuthService(db, () => now).signup({ name: '測試同學', studentId: 'TEST01', email: 'test@example.com', department: '資訊系', password: 'Test-password-2026', identity: 'student' });
    const result = new RegistrationService(db, () => now).register('ocean-workshop', account.user.id);
    db.close();
    db = openDatabase(filename);
    assert.equal(seedDatabase(db, now + 1000), 0);
    const session = new AuthService(db, () => now).authenticate('Bearer ' + account.token);
    assert.equal(session.user.id, account.user.id);
    assert.equal(new RegistrationService(db, () => now).get(result.id, account.user.id).status, 'confirmed');
  } finally { db.close(); }
});

test('8 個獨立資料庫連線同時搶 2 個名額，交易防止超收', async t => {
  const filename = fileDatabase(t);
  const db = openDatabase(filename);
  try {
    seedDatabase(db, now);
    const userIds = Array.from({ length: 8 }, () => randomUUID());
    for (const [index, id] of userIds.entries()) {
      db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, '測試', 'T' + index, `test${index}@example.com`, '資訊系', 'student', 'not-used', now);
    }
    const results = await Promise.all(userIds.map(id => worker(filename, id)));
    assert.ok(results.every(result => result.status === 201), JSON.stringify(results));
    assert.equal(results.filter(result => result.registrationStatus === 'confirmed').length, 2);
    assert.equal(results.filter(result => result.registrationStatus === 'waitlisted').length, 6);
    assert.equal(db.prepare("SELECT count(*) AS count FROM registrations WHERE status = 'confirmed'").get().count, 2);
  } finally { db.close(); }
});

test('多個獨立連線重複報名同一使用者，只建立一筆', async t => {
  const filename = fileDatabase(t);
  const db = openDatabase(filename);
  try {
    seedDatabase(db, now);
    const userId = randomUUID();
    db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(userId, '測試', 'T0001', 'test@example.com', '資訊系', 'student', 'not-used', now);
    const results = await Promise.all(Array.from({ length: 4 }, () => worker(filename, userId)));
    assert.equal(results.filter(result => result.status === 201).length, 1);
    assert.equal(results.filter(result => result.code === 'ALREADY_REGISTERED').length, 3);
    assert.equal(db.prepare('SELECT count(*) AS count FROM registrations').get().count, 1);
  } finally { db.close(); }
});

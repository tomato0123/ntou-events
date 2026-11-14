const { Pool } = require('pg');

const {
  createEvent,
  getAllEvents,
  closeDatabase: closeEventDb
} = require('./event-service');

const {
  getMyRegistrations,
  getEventRegistrations,
  closeDatabase: closeRegDb
} = require('./registration-service');

const testPool = new Pool({ connectionTimeoutMillis: 5000 });

/**
 * 取得或自動建立 3 位測試使用者，回傳他們的真實 user_id 陣列
 */
async function getOrCreateTestUserIds() {
  // 1. 先檢查 users 表裡是否已經有現成的使用者
  const existingUsers = await testPool.query(
    'SELECT id FROM users ORDER BY id ASC LIMIT 3'
  );

  if (existingUsers.rows.length >= 3) {
    return existingUsers.rows.map(r => r.id);
  }

  // 2. 若不足 3 人，偵測 users 表的欄位結構（不手動指定 id，避免 GENERATED ALWAYS 報錯）
  const colRes = await testPool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users'
  `);
  const colNames = colRes.rows.map(c => c.column_name);

  const sampleUsers = [
    { name: '王小明', email: `ming_${Date.now()}@ntou.edu.tw`, role: 'user' },
    { name: '陳小華', email: `hua_${Date.now()}@ntou.edu.tw`, role: 'user' },
    { name: '林同學', email: `lin_${Date.now()}@ntou.edu.tw`, role: 'user' }
  ];

  const userIds = existingUsers.rows.map(r => r.id);

  for (const u of sampleUsers) {
    if (userIds.length >= 3) break;

    const insertCols = [];
    const insertVals = [];

    if (colNames.includes('name')) { insertCols.push('name'); insertVals.push(u.name); }
    if (colNames.includes('username')) { insertCols.push('username'); insertVals.push(u.name); }
    if (colNames.includes('email')) { insertCols.push('email'); insertVals.push(u.email); }
    if (colNames.includes('role')) { insertCols.push('role'); insertVals.push(u.role); }
    if (colNames.includes('password')) { insertCols.push('password'); insertVals.push('hashed_pw_123'); }
    if (colNames.includes('password_hash')) { insertCols.push('password_hash'); insertVals.push('hashed_pw_123'); }

    const placeholders = insertVals.map((_, idx) => `$${idx + 1}`).join(', ');
    const inserted = await testPool.query(
      `INSERT INTO users (${insertCols.join(', ')}) VALUES (${placeholders}) RETURNING id`,
      insertVals
    );
    userIds.push(inserted.rows[0].id);
  }

  return userIds;
}

async function seedSampleRegistrations(eventId) {
  const userIds = await getOrCreateTestUserIds();

  // 檢查該活動是否已經有報名資料
  const existing = await testPool.query(
    'SELECT COUNT(*)::int AS cnt FROM registrations WHERE event_id = $1',
    [eventId]
  );

  if (existing.rows[0].cnt === 0) {
    console.log('目前該活動尚無報名紀錄，自動寫入測試報名與取消資料...');
    // 寫入 2 筆正式報名 ('registered') 與 1 筆取消報名 ('cancelled')
    await testPool.query(
      `INSERT INTO registrations (user_id, event_id, status, registered_at)
       VALUES
         ($1, $4, 'registered', NOW() - INTERVAL '2 hours'),
         ($2, $4, 'cancelled',  NOW() - INTERVAL '1 hour'),
         ($3, $4, 'registered', NOW())`,
      [userIds[0], userIds[1], userIds[2], eventId]
    );
    console.log('已寫入 2 筆正式報名、1 筆取消報名！\n');
  }

  return userIds[0]; // 回傳第一位使用者的 ID 供 [測試1] 查詢
}

async function test() {
  try {
    const mockManager = {
      id: 99,
      name: '系統管理員',
      email: 'admin@ntou.edu.tw',
      role: 'admin'
    };

    // 0. 確保資料庫至少有一筆活動可供測試
    let events = await getAllEvents();
    let targetEventId;

    if (events.length === 0) {
      console.log('資料庫目前無活動，自動建立一筆測試活動...');
      const newEvent = await createEvent(
        {
          title: '海大資工系學會迎新茶會',
          description: '歡迎大一新生一起來認識學長姐！',
          location: '電資大樓 B1 演講廳',
          starts_at: '2026-12-01T13:30:00Z',
          ends_at: '2026-12-01T16:30:00Z'
        },
        mockManager
      );
      targetEventId = newEvent.id;
      console.log(`已建立測試活動，ID 為：${targetEventId}\n`);
    } else {
      targetEventId = events[0].id;
      console.log(`使用現有活動進行測試，ID 為：${targetEventId}\n`);
    }

    // 塞入測試報名與取消紀錄，並取得真實存在的 userId
    const testUserId = await seedSampleRegistrations(targetEventId);

    // 1. 測試查看個人報名紀錄
    console.log(`---[測試1]查看個人報名紀錄 (user_id: ${testUserId})---`);
    const myresult = await getMyRegistrations(testUserId);
    console.log(JSON.stringify(myresult, null, 2));

    // 2. 測試 [US-08] 管理者查看特定活動的正式與取消名單
    console.log('\n---[測試2]管理者查看活動名單(US-08)---');
    const rosterResult = await getEventRegistrations(targetEventId, mockManager);
    console.log(JSON.stringify(rosterResult, null, 2));

  } catch (error) {
    console.error('查詢失敗：', error.message);
    process.exitCode = 1;
  } finally {
    await testPool.end();
    await closeEventDb();
    await closeRegDb();
  }
}

test();
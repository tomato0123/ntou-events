/**
 * US-07 本機驗收測試程式
 * 測試方法：
 * 1. 建立合法活動，確認訪客能搜尋及查看。
 * 2. 測試必填欄位缺漏及不合理的時間設定。
 * 3. 以一般使用者嘗試建立活動，確認操作遭拒絕。
 */

process.env.USE_MOCK_DB = 'true'; // 啟用測試模式 (亦可相容真實資料庫)

const app = require('./index');
const { generateToken } = require('./auth-middleware');
const {
  validateEventData,
  createEvent,
  getAllEvents,
  mockEvents
} = require('./event-service');

// 合法報名期間 (早於下方所有測試活動的開始時間)
const REG = {
  registration_opens_at: '2026-10-01T00:00:00Z',
  registration_closes_at: '2026-11-15T00:00:00Z'
};

// 準備測試帳號
const adminUser = { id: 99, name: '測試管理員', email: 'admin@ntou.edu.tw', role: 'admin' };
const managerUser = { id: 50, name: '測試活動主辦人', email: 'manager@ntou.edu.tw', role: 'event_manager' };
const normalUser = { id: 1, name: '測試學生', email: 'student@ntou.edu.tw', role: 'user' };

let passedCount = 0;
let failedCount = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passedCount++;
  } else {
    console.error(`  [FAIL] ${testName}: ${details}`);
    failedCount++;
  }
}

async function runServiceTests() {
  console.log('\n========================================');
  console.log('第一階段：服務層 (Service Layer) 核心邏輯測試');
  console.log('========================================');

  // 測試 1：建立合法活動
  console.log('\n--- 測試 1：建立合法活動 ---');
  try {
    const validEvent = {
      title: '2026 海大程式設計黑客松',
      description: '全校性黑客松，歡迎各科系組隊挑戰！',
      location: '電資大樓 國際會議廳',
      starts_at: '2026-11-20T09:00:00Z',
      ends_at: '2026-11-20T18:00:00Z',
      registration_opens_at: '2026-10-01T00:00:00Z',
      registration_closes_at: '2026-11-15T23:59:59Z'
    };

    const created = await createEvent(validEvent, managerUser);
    assert(created && created.id && created.title === validEvent.title, '活動管理者成功建立合法活動');
    assert(created.starts_at && created.ends_at, '活動包含正確開始與結束時間');

    const all = await getAllEvents('黑客松');
    assert(all.some(e => e.title.includes('黑客松')), '訪客搜尋功能可查看到剛建立的活動');
  } catch (err) {
    assert(false, '建立合法活動發生非預期錯誤', err.message);
  }

  // 測試 2：必填欄位缺漏及不合理的時間設定
  console.log('\n--- 測試 2：欄位缺漏與不合理時間設定檢查 ---');

  // 2-1 缺少活動名稱
  try {
    validateEventData({
      description: '說明',
      location: '地點',
      starts_at: '2026-12-01T10:00:00Z',
      ends_at: '2026-12-01T12:00:00Z',
      ...REG
    });
    assert(false, '缺少活動名稱應該拋出錯誤');
  } catch (err) {
    assert(err.message.includes('活動名稱'), '偵測到缺少活動名稱 (title)');
  }

  // 2-2 缺少地點
  try {
    validateEventData({
      title: '測試活動',
      description: '說明',
      starts_at: '2026-12-01T10:00:00Z',
      ends_at: '2026-12-01T12:00:00Z',
      ...REG
    });
    assert(false, '缺少活動地點應該拋出錯誤');
  } catch (err) {
    assert(err.message.includes('活動地點'), '偵測到缺少活動地點 (location)');
  }

  // 2-3 缺少開始時間
  try {
    validateEventData({
      title: '測試活動',
      description: '說明',
      location: '地點',
      ends_at: '2026-12-01T12:00:00Z',
      ...REG
    });
    assert(false, '缺少開始時間應該拋出錯誤');
  } catch (err) {
    assert(err.message.includes('開始時間'), '偵測到缺少開始時間 (starts_at)');
  }

  // 2-4 不合理時間：結束時間早於開始時間
  try {
    validateEventData({
      title: '時光倒流講座',
      description: '時間設定倒置',
      location: '共同教室 101',
      starts_at: '2026-12-01T18:00:00Z',
      ends_at: '2026-12-01T10:00:00Z', // 結束早於開始！
      ...REG
    });
    assert(false, '結束時間早於開始時間應該拋出錯誤');
  } catch (err) {
    assert(err.message.includes('必須晚於開始時間'), '成功攔截不合理時間設定 (結束早於開始)');
  }

  // 2-5 無效時間格式字串
  try {
    validateEventData({
      title: '無效格式活動',
      description: '說明',
      location: '地點',
      starts_at: 'Not-A-Date',
      ends_at: '2026-12-01T10:00:00Z',
      ...REG
    });
    assert(false, '無效時間格式應拋出錯誤');
  } catch (err) {
    assert(err.message.includes('格式無效'), '成功攔截無效時間字串');
  }

  // 2-6 報名截止時間晚於活動結束時間
  try {
    validateEventData({
      title: '報名時間錯誤活動',
      description: '說明',
      location: '地點',
      starts_at: '2026-12-01T10:00:00Z',
      ends_at: '2026-12-01T12:00:00Z',
      registration_opens_at: '2026-11-01T00:00:00Z',
      registration_closes_at: '2026-12-01T11:00:00Z' // 晚於活動開始
    });
    assert(false, '報名截止晚於活動開始應拋出錯誤');
  } catch (err) {
    assert(err.message.includes('不可晚於活動開始時間'), '成功攔截報名截止晚於活動開始');
  }

  const baseEvent = {
    title: '期間測試',
    description: '說明',
    location: '地點',
    starts_at: '2026-12-01T10:00:00Z',
    ends_at: '2026-12-01T12:00:00Z',
    ...REG
  };
  const expectError = (data, keyword, name) => {
    try {
      validateEventData(data);
      assert(false, name, '應該拋出錯誤');
    } catch (err) {
      assert(err.statusCode === 400 && err.message.includes(keyword), name, err.message);
    }
  };

  // 2-7 缺少報名期間 (v2.2 必填)
  expectError({ ...baseEvent, registration_opens_at: undefined }, '報名開始時間', '偵測到缺少報名開始時間');
  expectError({ ...baseEvent, registration_closes_at: undefined }, '報名截止時間', '偵測到缺少報名截止時間');
  // 2-8 報名截止早於報名開始
  expectError({ ...baseEvent, registration_opens_at: '2026-11-20T00:00:00Z', registration_closes_at: '2026-11-10T00:00:00Z' },
    '必須晚於報名開始時間', '成功攔截報名截止早於報名開始');
  // 2-9 時間未帶時區
  expectError({ ...baseEvent, starts_at: '2026-12-01T10:00:00' }, '必須帶時區', '成功攔截未帶時區的時間');
  // 2-10 is_published 非布林
  expectError({ ...baseEvent, is_published: 'true' }, 'is_published', '成功攔截非布林公開狀態');

  // 2-11 邊界：報名截止恰好等於活動開始 → 允許；公開狀態預設 false
  try {
    const ok = validateEventData({ ...baseEvent, registration_closes_at: '2026-12-01T10:00:00Z' });
    assert(ok.is_published === false, '報名截止等於活動開始可通過，公開狀態預設 false');
  } catch (err) {
    assert(false, '報名截止等於活動開始應該允許', err.message);
  }

  // 測試 3：一般使用者嘗試建立活動，確認操作遭拒絕
  console.log('\n--- 測試 3：權限測試 (一般使用者嘗試建立活動) ---');
  try {
    await createEvent(
      {
        title: '學生自辦社聚',
        description: '未經核可發布活動',
        location: '操場',
        starts_at: '2026-12-10T14:00:00Z',
        ends_at: '2026-12-10T16:00:00Z',
        ...REG
      },
      normalUser
    );
    assert(false, '一般使用者建立活動應該拋出權限錯誤');
  } catch (err) {
    assert(err.statusCode === 403, '一般使用者操作遭拒絕 (HTTP 403 Forbidden)');
  }

  // 未登入使用者嘗試建立活動
  try {
    await createEvent(
      {
        title: '匿名活動',
        description: '說明',
        location: '地點',
        starts_at: '2026-12-10T14:00:00Z',
        ends_at: '2026-12-10T16:00:00Z',
        ...REG
      },
      null
    );
    assert(false, '未登入訪客建立活動應該拋出未授權錯誤');
  } catch (err) {
    assert(err.statusCode === 401, '未登入訪客操作遭拒絕 (HTTP 401 Unauthorized)');
  }
}

async function runApiHttpTests() {
  console.log('\n========================================');
  console.log('第二階段：Express HTTP API 規格整合測試');
  console.log('========================================');

  // 在動態連接埠啟動測試伺服器
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  const adminToken = generateToken(adminUser);
  const normalUserToken = generateToken(normalUser);

  try {
    // API 測試 1：管理員透過 POST /api/events 建立活動
    console.log('\n--- API 測試 1：管理員發布合法活動 ---');
    const createRes = await fetch(`${baseUrl}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        title: 'AI 實戰工作坊',
        description: '帶你從零打造校園聊天機器人。',
        location: '資訊大樓 302 教室',
        starts_at: '2026-12-01T13:30:00Z',
        ends_at: '2026-12-01T16:30:00Z',
        ...REG
      })
    });

    const createBody = await createRes.json();
    assert(createRes.status === 201, 'HTTP 回傳狀態碼為 201 Created');
    assert(createBody.message === '活動建立成功', '回傳成功訊息 "活動建立成功"');
    assert(createBody.data && createBody.data.id && createBody.data.title === 'AI 實戰工作坊', '回傳資料包含活動編號與內容');

    // 訪客公開查詢 GET /api/events
    const getRes = await fetch(`${baseUrl}/events`);
    const getBody = await getRes.json();
    assert(getRes.status === 200, '訪客查詢活動回傳 200 OK');
    assert(Array.isArray(getBody.data) && getBody.data.some(e => e.title === 'AI 實戰工作坊'), '訪客可以在公開列表查看到剛發布的活動');

    // API 測試 2：欄位缺漏與不合理時間設定
    console.log('\n--- API 測試 2：API 欄位檢核與時間驗證 ---');
    // 2-1 缺少 title
    const badReq1 = await fetch(`${baseUrl}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        description: '缺漏名稱',
        location: '教室',
        starts_at: '2026-12-01T13:30:00Z',
        ends_at: '2026-12-01T16:30:00Z',
        ...REG
      })
    });
    const badBody1 = await badReq1.json();
    assert(badReq1.status === 400, '缺少必填欄位回傳 400 Bad Request');
    assert(badBody1.error && badBody1.error.includes('活動名稱'), '錯誤訊息明確指出活動名稱為必填');

    // 2-2 不合理時間 (結束早於開始)
    const badReq2 = await fetch(`${baseUrl}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        title: '時間錯誤活動',
        description: '時間倒置',
        location: '教室',
        starts_at: '2026-12-01T16:30:00Z',
        ends_at: '2026-12-01T13:30:00Z',
        ...REG
      })
    });
    const badBody2 = await badReq2.json();
    assert(badReq2.status === 400, '結束時間早於開始時間回傳 400 Bad Request');
    assert(badBody2.error && badBody2.error.includes('必須晚於開始時間'), '錯誤訊息明確提示時間設定合理性');

    // API 測試 3：一般使用者嘗試建立活動 -> 403 Forbidden
    console.log('\n--- API 測試 3：一般使用者嘗試建立活動 ---');
    const forbiddenReq = await fetch(`${baseUrl}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${normalUserToken}`
      },
      body: JSON.stringify({
        title: '學生偷辦活動',
        description: '測試權限',
        location: '學生宿舍',
        starts_at: '2026-12-01T13:30:00Z',
        ends_at: '2026-12-01T16:30:00Z',
        ...REG
      })
    });
    const forbiddenBody = await forbiddenReq.json();
    assert(forbiddenReq.status === 403, '一般使用者建立活動回傳 403 Forbidden');
    assert(forbiddenBody.error && forbiddenBody.error.includes('權限不足'), '回傳權限不足錯誤提示');

    // 未帶 Token 訪客嘗試建立活動 -> 401 Unauthorized
    const unauthReq = await fetch(`${baseUrl}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '訪客無權杖建立',
        description: '測試訪客阻擋',
        location: '體育館',
        starts_at: '2026-12-01T13:30:00Z',
        ends_at: '2026-12-01T16:30:00Z',
        ...REG
      })
    });
    const unauthBody = await unauthReq.json();
    assert(unauthReq.status === 401, '未帶 Token 建立活動回傳 401 Unauthorized');
    assert(unauthBody.error !== undefined, '回傳未登入錯誤訊息');

    // API 測試 4：UI-05 修改活動 PUT /api/events/{id}
    console.log('\n--- API 測試 4：UI-05 修改活動 ---');
    const eventId = createBody.data.id;
    const putBody = {
      title: 'AI 實戰工作坊（加場）',
      description: '延長實作時間。',
      location: '資訊大樓 303 教室',
      starts_at: '2026-12-01T21:30:00+08:00',
      ends_at: '2026-12-02T01:30:00+08:00',
      registration_opens_at: '2026-11-01T08:00:00+08:00',
      registration_closes_at: '2026-11-30T23:59:00+08:00',
      is_published: true
    };
    const put = (id, body, token) => fetch(`${baseUrl}/events/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
      body: JSON.stringify(body)
    });

    const putRes = await put(eventId, putBody, adminToken);
    const putJson = await putRes.json();
    assert(putRes.status === 200, '管理員修改活動回傳 200 OK');
    assert(putJson.message === '活動更新成功', '回傳成功訊息 "活動更新成功"');
    assert(putJson.data && putJson.data.title === putBody.title && putJson.data.is_published === true, '回傳更新後的活動資料');
    assert(putJson.data && putJson.data.starts_at === '2026-12-01T13:30:00.000Z', '帶 +08:00 的時間正確轉為 UTC 儲存');
    assert(putJson.data && putJson.data.registration_closes_at === '2026-11-30T15:59:00.000Z', '回傳報名截止時間');

    const detailRes = await fetch(`${baseUrl}/events/${eventId}`);
    const detail = await detailRes.json();
    assert(detail.location === putBody.location && detail.registration_opens_at === '2026-11-01T00:00:00.000Z', '重新查詢可取得修改後的內容');

    const badPut = await put(eventId, { ...putBody, registration_closes_at: '2026-12-01T22:00:00+08:00' }, adminToken);
    const badPutJson = await badPut.json();
    assert(badPut.status === 400 && badPutJson.error.includes('不可晚於活動開始時間'), '修改時時間順序不合理回傳 400');

    const notFoundPut = await put(999999, putBody, adminToken);
    assert(notFoundPut.status === 404, '修改不存在的活動回傳 404');

    const forbiddenPut = await put(eventId, putBody, normalUserToken);
    assert(forbiddenPut.status === 403, '一般使用者修改活動回傳 403');

    const unauthPut = await put(eventId, putBody, null);
    assert(unauthPut.status === 401, '未帶 Token 修改活動回傳 401');

    const badIdPut = await put('abc', putBody, adminToken);
    assert(badIdPut.status === 400, '活動編號非整數回傳 400');

    const looseIdPut = await put(`${eventId}xyz`, putBody, adminToken);
    assert(looseIdPut.status === 400, '活動編號含非數字字元回傳 400');

    // API 測試 5：活動負責人（BFR-06）— 管理者只能修改自己負責的活動
    console.log('\n--- API 測試 5：修改活動的負責人限制 ---');
    assert(createBody.data.manager_id === adminUser.id, '建立活動時負責人為登入建立者');
    const managerToken = generateToken(managerUser);
    const otherManagerToken = generateToken({ id: 51, name: '其他管理者', email: 'manager2@ntou.edu.tw', role: 'event_manager' });

    const ownRes = await fetch(`${baseUrl}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${managerToken}` },
      body: JSON.stringify({ ...putBody, title: '管理者自己的活動', manager_id: 999 })
    });
    const ownBody = await ownRes.json();
    assert(ownRes.status === 201 && ownBody.data.manager_id === managerUser.id, '忽略前端指定的 manager_id，負責人為登入者');

    const ownPut = await put(ownBody.data.id, { ...putBody, title: '管理者修改自己的活動' }, managerToken);
    assert(ownPut.status === 200, '活動管理者可修改自己負責的活動');

    const othersPut = await put(ownBody.data.id, putBody, otherManagerToken);
    const othersJson = await othersPut.json();
    assert(othersPut.status === 403 && othersJson.error.includes('自己負責'), '其他活動管理者修改他人活動回傳 403');

    const adminOnOthers = await put(ownBody.data.id, { ...putBody, title: '管理員代為修改' }, adminToken);
    const adminOnOthersJson = await adminOnOthers.json();
    assert(adminOnOthers.status === 200 && adminOnOthersJson.data.manager_id === managerUser.id, '系統管理員可修改任何活動，且負責人不被改變');

    mockEvents.push({ ...putBody, id: 777, manager_id: null, is_published: false, created_at: new Date().toISOString() });
    const nullOwnerByManager = await put(777, putBody, managerToken);
    assert(nullOwnerByManager.status === 403, '尚未指定負責人的舊活動，活動管理者不可修改');
    const nullOwnerByAdmin = await put(777, putBody, adminToken);
    assert(nullOwnerByAdmin.status === 200, '尚未指定負責人的舊活動，系統管理員可修改');

  } finally {
    server.close();
  }
}

async function main() {
  console.log('========================================================');
  console.log('   NTOU-US-07【建立活動】後端功能與 API 驗收測試');
  console.log('========================================================');

  try {
    await runServiceTests();
    await runApiHttpTests();

    console.log('\n========================================');
    console.log(`測試總結：通過 ${passedCount} 項，失敗 ${failedCount} 項`);
    console.log('========================================');

    if (failedCount > 0) {
      process.exitCode = 1;
    } else {
      console.log('🎉 US-07 所有驗收測試皆已全數通過！\n');
    }
  } catch (error) {
    console.error('執行測試過程中發生例外：', error);
    process.exitCode = 1;
  }
}

main();


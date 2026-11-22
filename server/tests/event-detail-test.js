const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { once } = require('node:events');
const { getEventById, mockEvents } = require('../event-service');
const { mockRegistrations, mockUsers } = require('../registration-service');

// 本檔不連線真實資料庫；SQL 路徑使用注入的 pool，HTTP 與 UI 路徑使用記憶體資料。
delete process.env.USE_MOCK_DB;

const root = path.join(__dirname, '../..');

const sampleEvent = {
  id: 101,
  title: '海大校園搖滾音樂祭：海風之夜',
  description: '活動內容、參加方式及注意事項',
  location: '展示廳前廣場',
  organizer: '熱音社 × 學生會',
  manager_id: 10,
  starts_at: '2030-05-20T10:00:00Z',
  ends_at: '2030-05-20T13:30:00Z',
  registration_opens_at: '2026-01-01T00:00:00Z',
  registration_closes_at: '2030-05-19T15:59:00Z',
  is_published: true
};

test('UI 靜態結構：event-detail.html 與 event-detail.css 具備線框圖所有必要欄位與無障礙標籤', () => {
  const htmlPath = path.join(root, 'event-detail.html');
  const cssPath = path.join(root, 'event-detail.css');
  const jsPath = path.join(root, 'event-detail.js');

  assert.ok(fs.existsSync(htmlPath), '應存在 event-detail.html');
  assert.ok(fs.existsSync(cssPath), '應存在 event-detail.css');
  assert.ok(fs.existsSync(jsPath), '應存在 event-detail.js');

  const html = fs.readFileSync(htmlPath, 'utf8');

  // 檢查共用模組載入順序
  assert.match(html, /<script src="api-config\.js" defer><\/script>/);
  assert.match(html, /<script src="auth-session\.js" defer><\/script>/);
  assert.match(html, /<script src="event-detail\.js" defer><\/script>/);

  // 檢查線框圖對應的關鍵 DOM ID
  for (const id of [
    'page-loading',
    'page-error',
    'event-detail-box',
    'event-poster',
    'event-title',
    'event-organizer',
    'event-time',
    'event-location',
    'event-reg-period',
    'event-description',
    'event-status-text',
    'register-btn',
    'status-message-box'
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `event-detail.html 缺少線框圖必要元素 #${id}`);
  }

  // 檢查返回活動列表連結
  assert.match(html, /href="index\.html"[^>]*>.*返回活動列表/);
});

test('SQL 單一活動查詢：getEventById 正確查詢或回傳 null', async () => {
  const database = {
    async query(sql, values) {
      assert.match(sql, /FROM events/);
      if (values[0] === 999) return { rows: [] };
      return { rows: [{ ...sampleEvent, id: values[0] }] };
    }
  };

  const found = await getEventById(101, database);
  assert.equal(found.id, 101);
  assert.equal(found.title, sampleEvent.title);

  const missing = await getEventById(999, database);
  assert.equal(missing, null);
});

test('HTTP：GET /api/events/:id 與靜態頁面回應驗證', async t => {
  process.env.USE_MOCK_DB = 'true';
  mockEvents.push({ ...sampleEvent });

  const app = require('../index');
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');

  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    delete process.env.USE_MOCK_DB;
    mockEvents.length = 0;
    mockRegistrations.length = 0;
    mockUsers.length = 0;
  });

  const base = `http://127.0.0.1:${server.address().port}`;

  // 1. 正常取得活動詳情 (200)
  const resOk = await fetch(`${base}/api/events/101`);
  assert.equal(resOk.status, 200);
  const bodyOk = await resOk.json();
  assert.equal(bodyOk.id, 101);
  assert.equal(bodyOk.title, sampleEvent.title);
  assert.equal(bodyOk.location, sampleEvent.location);

  // 2. 不存在的活動 (404)
  const res404 = await fetch(`${base}/api/events/999`);
  assert.equal(res404.status, 404);
  assert.deepEqual(Object.keys(await res404.json()), ['error']);

  // 3. 非整數活動編號 (400)
  const res400 = await fetch(`${base}/api/events/abc`);
  assert.equal(res400.status, 400);
  assert.deepEqual(Object.keys(await res400.json()), ['error']);
});

// 輔助函式：在記憶體沙箱中模擬執行 event.js，驗證 DOM 渲染與按鈕互動（不需開啟瀏覽器）
async function runEventJsInDom({ search = '?id=101', token = '', fetchHandler }) {
  const elements = {};
  const ids = [
    'page-loading', 'page-error', 'page-error-text', 'event-detail-box',
    'poster-title', 'event-title', 'event-organizer', 'event-time',
    'event-location', 'event-reg-period', 'event-description',
    'event-status-text', 'register-btn', 'status-message-box'
  ];

  for (const id of ids) {
    elements[`#${id}`] = {
      id,
      textContent: '',
      className: '',
      hidden: id === 'page-error' || id === 'event-detail-box',
      disabled: false,
      onclick: null
    };
  }

  const sandbox = {
    window: {
      location: { search },
      NtouConfig: { apiBase: 'http://127.0.0.1:8000/api' },
      NtouSession: { getToken: () => token }
    },
    document: {
      title: '',
      querySelector: selector => elements[selector] || null
    },
    URLSearchParams,
    Intl,
    Date,
    encodeURIComponent,
    setTimeout,
    console: { warn() {}, error() {} },
    fetch: fetchHandler
  };

  const code = fs.readFileSync(path.join(root, 'event-detail.js'), 'utf8');
  vm.runInNewContext(code, sandbox);
  // 等待非同步 init() 完成
  await new Promise(resolve => setTimeout(resolve, 20));
  return elements;
}

for (const scenario of [
  {
    name: '開放報名中（未登入點擊報名提示錯誤）',
    event: sampleEvent,
    token: '',
    expectOpen: true,
    expectStatus: '報名開放中',
    clickExpectClass: 'status-message-box error'
  },
  {
    name: '開放報名中（已登入點擊報名成功）',
    event: sampleEvent,
    token: 'valid-jwt-token',
    expectOpen: true,
    expectStatus: '報名開放中',
    clickExpectClass: 'status-message-box success'
  },
  {
    name: '已結束活動（按鈕自動 disabled 鎖定）',
    event: {
      ...sampleEvent,
      starts_at: '2020-01-01T10:00:00Z',
      ends_at: '2020-01-01T12:00:00Z',
      registration_opens_at: '2019-12-01T00:00:00Z',
      registration_closes_at: '2019-12-31T00:00:00Z'
    },
    token: 'valid-jwt-token',
    expectOpen: false,
    expectStatus: '已結束'
  }
]) {
  test(`UI 狀態與報名互動：${scenario.name}`, async () => {
    const dom = await runEventJsInDom({
      search: '?id=101',
      token: scenario.token,
      fetchHandler: async (url, options = {}) => {
        if (options.method === 'POST') {
          assert.equal(options.headers.Authorization, `Bearer ${scenario.token}`);
          return {
            ok: true,
            status: 201,
            json: async () => ({ message: '報名成功！已將您加入此活動名單。' })
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => scenario.event
        };
      }
    });

    assert.equal(dom['#page-loading'].hidden, true, '載入完成後應隱藏 loading');
    assert.equal(dom['#event-detail-box'].hidden, false, '應顯示活動詳情主卡片');
    assert.equal(dom['#event-title'].textContent, scenario.event.title);
    assert.equal(dom['#event-location'].textContent, scenario.event.location);
    assert.equal(dom['#event-status-text'].textContent, scenario.expectStatus);
    assert.equal(dom['#register-btn'].disabled, !scenario.expectOpen);

    if (scenario.expectOpen && dom['#register-btn'].onclick) {
      await dom['#register-btn'].onclick();
      assert.equal(dom['#status-message-box'].className, scenario.clickExpectClass);
      if (scenario.token) {
        assert.equal(dom['#register-btn'].disabled, true, '報名成功後按鈕應鎖定');
        assert.equal(dom['#register-btn'].textContent, '已報名');
      }
    }
  });
}
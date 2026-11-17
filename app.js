// ===== 設定 =====
// API 位址由 api-config.js 提供（後端提供網頁時為同源 /api，Live Server 時連 127.0.0.1:8000）
const API_BASE = window.NtouConfig.apiBase;

// 分類清單由後端提供（GET /api/categories），前端不寫死，避免與後端規則不一致
async function loadCategories() {
  const response = await fetch(`${API_BASE}/categories`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const json = await response.json();
  return Array.isArray(json.data) ? json.data : [];
}

const PAGE_SIZE = 6;

// ===== 狀態 =====
const state = { query: '', category: '', categories: [], visible: PAGE_SIZE, events: [], loading: false, failed: false };
let requestId = 0; // 避免舊的回應覆蓋新的搜尋結果

const grid = document.querySelector('#event-grid');
const search = document.querySelector('#search');
const dialog = document.querySelector('#event-dialog');
const resultCount = document.querySelector('#result-count');
const emptyState = document.querySelector('#empty-state');
const loadMore = document.querySelector('#load-more');
const categoryFilters = document.querySelector('#category-filters');

// ===== 時間格式（統一 Asia/Taipei）=====
const dateFormat = new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', weekday: 'short' });
const timeFormat = new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false });
const yearFormat = new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric' });

function eventTime(event) {
  const start = new Date(event.starts_at);
  const end = new Date(event.ends_at);
  return `${dateFormat.format(start)} ${timeFormat.format(start)}–${timeFormat.format(end)}`;
}

// 目前資料庫沒有報名期間與名額，狀態只依活動時間判斷
function status(event) {
  const now = Date.now();
  if (now >= new Date(event.ends_at).getTime()) return '已結束';
  if (now >= new Date(event.starts_at).getTime()) return '進行中';
  return '即將開始';
}

function categoryLabel(value) {
  return state.categories.find(c => c.value === value)?.label || value || '未分類';
}

function isKnownCategory(value) {
  return state.categories.some(c => c.value === value);
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// ===== 分類按鈕 =====
function renderCategoryButtons() {
  const options = [{ value: '', label: '全部' }, ...state.categories];
  categoryFilters.replaceChildren(...options.map(({ value, label }) => {
    const button = element('button', 'filter-chip', label);
    button.type = 'button';
    button.setAttribute('aria-pressed', String(state.category === value));
    button.addEventListener('click', () => {
      if (state.category !== value) applyFilters({ category: value });
    });
    return button;
  }));
  categoryFilters.hidden = state.categories.length === 0;
}

// ===== 活動卡片 =====
function card(event) {
  const article = element('article', 'event-card');
  const top = element('div', 'card-top');

  const currentStatus = status(event);
  const isOpen = currentStatus === '即將開始';
  top.append(
    element('span', 'event-category', categoryLabel(event.category)),
    element('span', `event-status${isOpen ? '' : ' closed'}`, `${isOpen ? '● ' : ''}${currentStatus}`)
  );

  const meta = element('div', 'event-meta');
  for (const [icon, value] of [['◷', eventTime(event)], ['⌖', event.location]]) {
    const row = element('div', 'meta-row');
    const mark = element('span', 'meta-icon', icon);
    mark.setAttribute('aria-hidden', 'true');
    row.append(mark, element('span', '', value));
    meta.append(row);
  }

  const bottom = element('div', 'card-bottom');
  const details = element('button', 'details-button', '查看活動');
  details.type = 'button';
  details.setAttribute('aria-label', `查看活動：${event.title}`);
  const arrow = element('span', '', '↗');
  arrow.setAttribute('aria-hidden', 'true');
  details.append(arrow);
  details.addEventListener('click', () => showEvent(event.id));
  bottom.append(details);

  article.append(top, element('h3', '', event.title), element('p', 'event-description', event.description), meta, bottom);
  return article;
}

// ===== 取得活動列表 =====
async function fetchEvents() {
  const currentRequest = ++requestId;
  state.loading = true;
  state.failed = false;
  render();

  try {
    const url = new URL(`${API_BASE}/events`, window.location.href);
    if (state.query) url.searchParams.set('search', state.query);
    if (state.category) url.searchParams.set('category', state.category);

    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();

    if (currentRequest !== requestId) return; // 已有更新的請求，丟棄這次結果
    state.events = Array.isArray(json.data) ? json.data : [];
  } catch (error) {
    if (currentRequest !== requestId) return;
    console.error('取得活動列表失敗：', error);
    state.events = [];
    state.failed = true;
  } finally {
    if (currentRequest === requestId) {
      state.loading = false;
      render();
    }
  }
}

// ===== 畫面渲染 =====
function render() {
  emptyState.hidden = true;
  loadMore.hidden = true;

  if (state.loading) {
    grid.replaceChildren(element('p', 'loading', '活動載入中…'));
    resultCount.textContent = '';
    return;
  }

  if (state.failed) {
    const message = element('div', 'error');
    const retry = element('button', 'button button-outline', '重新載入');
    retry.type = 'button';
    retry.addEventListener('click', fetchEvents);
    message.append(element('p', '', '無法載入活動，請確認後端服務已啟動後重試。'), retry);
    grid.replaceChildren(message);
    resultCount.textContent = '';
    return;
  }

  const total = state.events.length;
  grid.replaceChildren(...state.events.slice(0, state.visible).map(card));
  const filters = [
    state.category ? `分類「${categoryLabel(state.category)}」` : '',
    state.query ? `搜尋「${state.query}」` : ''
  ].filter(Boolean);
  resultCount.textContent = `共 ${total} 場活動${filters.length ? ` · ${filters.join(' · ')}` : ''}`;
  emptyState.hidden = total !== 0;
  loadMore.hidden = state.visible >= total;
}

// ===== 活動詳情（呼叫 GET /api/events/{id}）=====
function openDialog(category, title, ...bodyNodes) {
  document.querySelector('#dialog-category').textContent = category;
  document.querySelector('#dialog-title').textContent = title;
  document.querySelector('#dialog-body').replaceChildren(...bodyNodes);
  if (!dialog.open) dialog.showModal();
}

function renderDialog(event) {
  const start = new Date(event.starts_at);
  const info = element('dl');
  const rows = [
    ['活動分類', categoryLabel(event.category)],
    ['日期時間', `${yearFormat.format(start)} / ${eventTime(event)}`],
    ['活動地點', event.location]
  ];
  // 主辦單位目前資料庫沒有欄位，有資料時才顯示
  if (event.organizer) rows.push(['主辦單位', event.organizer]);

  for (const [label, value] of rows) {
    info.append(element('dt', '', label), element('dd', '', value));
  }

  openDialog(
    `${categoryLabel(event.category)}・${status(event)}`,
    event.title,
    info,
    element('p', 'dialog-description', event.description),
    element('p', 'dialog-notice', '請先登入帳號以進行活動報名。')
  );
}

async function showEvent(id) {
  try {
    const response = await fetch(`${API_BASE}/events/${encodeURIComponent(id)}`);
    if (response.status === 404) throw new Error('找不到該活動，可能已被移除或尚未公開。');
    if (!response.ok) throw new Error(`伺服器回應錯誤（${response.status}）`);
    renderDialog(await response.json());
  } catch (error) {
    console.error('取得活動詳情失敗：', error);
    openDialog('錯誤', '無法顯示活動', element('p', 'dialog-description', error.message));
  }
}

// ===== 篩選與網址同步（?q=關鍵字&category=分類）=====
// changes 只放要改的條件，例如 { category: 'club' }；沒給的條件維持不變
function applyFilters(changes, { pushHistory = true } = {}) {
  if ('query' in changes) state.query = changes.query.trim();
  if ('category' in changes) state.category = isKnownCategory(changes.category) ? changes.category : '';
  state.visible = PAGE_SIZE;
  search.value = state.query;
  renderCategoryButtons();

  if (pushHistory) {
    const url = new URL(window.location.href);
    if (state.query) url.searchParams.set('q', state.query);
    else url.searchParams.delete('q');
    if (state.category) url.searchParams.set('category', state.category);
    else url.searchParams.delete('category');
    history.pushState({}, '', url);
  }
  fetchEvents();
}

function readUrl() {
  const params = new URLSearchParams(window.location.search);
  applyFilters({ query: params.get('q') || '', category: params.get('category') || '' }, { pushHistory: false });
}

// ===== 事件綁定 =====
document.querySelector('#search-form').addEventListener('submit', event => {
  event.preventDefault();
  applyFilters({ query: search.value });
});

// 清空搜尋框時，自動回到不限關鍵字（分類維持不變）
search.addEventListener('input', () => {
  if (search.value === '' && state.query !== '') applyFilters({ query: '' });
});

document.querySelector('#clear-filters').addEventListener('click', () => {
  applyFilters({ query: '', category: '' });
  search.focus();
});

loadMore.addEventListener('click', () => {
  const previousCount = grid.children.length;
  state.visible += PAGE_SIZE;
  render();
  grid.children[previousCount]?.querySelector('button')?.focus();
});

document.querySelector('#close-dialog').addEventListener('click', () => dialog.close());

dialog.addEventListener('click', event => {
  if (event.target === dialog) {
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  }
});

document.querySelectorAll('[data-account]').forEach(button => button.addEventListener('click', () => {
  openDialog('帳號服務', '登入與我的報名', element('p', 'dialog-description', '登入與報名功能將在後續階段開放。'));
}));

window.addEventListener('popstate', readUrl);

// ===== 啟動：先取得分類，再依網址載入活動 =====
(async function init() {
  try {
    state.categories = await loadCategories();
  } catch (error) {
    // 分類載入失敗時仍可瀏覽全部活動，只是不顯示分類按鈕
    console.error('取得分類失敗：', error);
  }
  readUrl();
})();
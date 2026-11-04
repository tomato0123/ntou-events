const api = '/api/users/me/registrations';
const grid = document.querySelector('#records-grid');
const area = document.querySelector('#records-area');
const stateBox = document.querySelector('#records-state');
const feedback = document.querySelector('#feedback');
const retry = document.querySelector('#retry');
const dialog = document.querySelector('#cancel-dialog');
const confirmButton = document.querySelector('#confirm-cancel');
const keepButton = document.querySelector('#keep-registration');
let records = [];
let filter = 'all';
let selected = null;
let pending = false;
let loaded = false;
const dateTime = new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false
});
function node(tag, className, text) {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}
function formatDate(value) { return dateTime.format(new Date(value)); }
function showState(title, description, canRetry = false) {
  stateBox.hidden = false;
  document.querySelector('#state-title').textContent = title;
  document.querySelector('#state-description').textContent = description;
  retry.hidden = !canRetry;
}
async function request(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(10000), ...options });
  if (!response.ok) {
    let message = '暫時無法處理，請稍後重試。';
    try { message = (await response.json()).message || message; } catch { /* Non-JSON server failure. */ }
    throw Object.assign(new Error(message), { status: response.status });
  }
  return response.json();
}
function validRecord(record) {
  return Number.isSafeInteger(record.id) && ['registered', 'cancelled'].includes(record.status) &&
    record.event && typeof record.event.title === 'string' && typeof record.event.location === 'string' &&
    [record.registered_at, record.event.starts_at, record.event.ends_at].every(value => typeof value === 'string' && Number.isFinite(Date.parse(value)));
}
function render() {
  if (!loaded) return;
  const matches = records.filter(record => filter === 'all' || record.status === filter);
  grid.replaceChildren(...matches.map(record => {
    const event = record.event;
    const started = Date.parse(event.starts_at) <= Date.now();
    const ended = Date.parse(event.ends_at) <= Date.now();
    const cancelled = record.status === 'cancelled';
    const card = node('article', 'event-card registration-card', '');
    const top = node('div', 'card-top', '');
    top.append(node('span', `registration-badge${cancelled ? ' cancelled' : ''}`, cancelled ? '已取消' : '已報名'),
      node('span', 'event-status closed', ended ? '活動已結束' : started ? '活動進行中' : '活動未開始'));
    const meta = node('div', 'event-meta', '');
    meta.append(node('div', 'meta-row', `開始 · ${formatDate(event.starts_at)}`),
      node('div', 'meta-row', `結束 · ${formatDate(event.ends_at)}`), node('div', 'meta-row', `地點 · ${event.location}`));
    const bottom = node('div', 'card-bottom', '');
    bottom.append(node('span', 'seats', cancelled ? '已保留取消紀錄' : started ? '活動開始後無法取消' : '活動開始前可取消'));
    if (!cancelled && !started) {
      const button = node('button', 'cancel-button', '取消報名');
      button.setAttribute('aria-label', `取消報名：${event.title}`);
      button.addEventListener('click', () => {
        selected = record;
        document.querySelector('#cancel-description').textContent = `你即將取消「${event.title}」（${formatDate(event.starts_at)}）的報名。`;
        document.querySelector('#cancel-error').textContent = '';
        dialog.showModal();
      });
      bottom.append(button);
    }
    card.append(top, node('h3', '', event.title), meta,
      node('p', 'registration-date', `報名時間 · ${formatDate(record.registered_at)} · 紀錄 #${record.id}`), bottom);
    return card;
  }));
  feedback.textContent = `共 ${matches.length} 筆${filter === 'registered' ? '已報名' : filter === 'cancelled' ? '已取消' : '報名'}紀錄`;
  stateBox.hidden = matches.length > 0;
  if (!matches.length) showState(records.length ? '沒有符合的報名紀錄' : '目前沒有報名紀錄', records.length ? '試試切換其他報名狀態。' : '到活動探索看看感興趣的活動吧。');
  document.querySelectorAll('[data-status]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.status === filter)));
}
async function load() {
  loaded = false;
  records = [];
  grid.replaceChildren();
  feedback.textContent = '';
  area.setAttribute('aria-busy', 'true');
  showState('正在載入報名紀錄…', '請稍候。');
  document.querySelector('#test-notice').hidden = true;
  try {
    const result = await request(api);
    if (!Array.isArray(result.data) || !result.data.every(validRecord)) throw new Error('資料格式不正確，請稍後重試。');
    records = result.data.sort((a, b) => Date.parse(b.registered_at) - Date.parse(a.registered_at) || b.id - a.id);
    loaded = true;
    const notice = document.querySelector('#test-notice');
    notice.hidden = !result.meta?.localTest;
    notice.textContent = `本機測試模式 · 測試帳號 #${result.meta?.userId}。取消操作會修改此帳號的真實資料庫紀錄。`;
    render();
  } catch (error) {
    showState(error.status === 401 ? '請先登入' : '無法載入報名紀錄',
      error.status === 401 ? '目前尚未接上登入服務。本機試作請依後端說明設定測試帳號，再重新載入。' : '無法取得資料，請確認服務可用後重試。', true);
  } finally { area.setAttribute('aria-busy', 'false'); }
}
document.querySelector('#record-filters').addEventListener('click', event => {
  const button = event.target.closest('button[data-status]');
  if (!button) return;
  filter = button.dataset.status;
  render();
});
retry.addEventListener('click', load);
keepButton.addEventListener('click', () => dialog.close());
dialog.addEventListener('cancel', event => { if (pending) event.preventDefault(); });
confirmButton.addEventListener('click', async () => {
  if (pending || !selected) return;
  pending = true;
  confirmButton.disabled = keepButton.disabled = true;
  confirmButton.textContent = '取消處理中…';
  document.querySelector('#cancel-error').textContent = '';
  try {
    const result = await request(`${api}/${selected.id}/cancel`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-UI04-Request': '1' }, body: '{}'
    });
    if (result.data?.id !== selected.id || result.data?.status !== 'cancelled') throw new Error('未能確認取消結果，請重新載入紀錄確認。');
    selected.status = 'cancelled';
    dialog.close();
    render();
    feedback.textContent = '已取消報名，紀錄已保留。';
    // The triggering button no longer exists after rendering.
    document.querySelector(`[data-status="${filter}"]`).focus();
  } catch (error) {
    document.querySelector('#cancel-error').textContent = error.status ? error.message : '未能確認取消結果，請稍後重試或重新載入紀錄。';
  } finally {
    pending = false;
    confirmButton.disabled = keepButton.disabled = false;
    confirmButton.textContent = '確認取消報名';
  }
});
load();

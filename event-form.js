// UI-05 活動建立與編輯
// 對應：SRD UI-05 / BFR-06 / US-07；API 2.3 POST /api/events、2.4 PUT /api/events/{id}
// 時間以 Asia/Taipei (UTC+8) 輸入與顯示，送出時帶 +08:00 時區。

// 與 UI-06 共用：api-config.js 提供 API 位址，auth-session.js 保存登入 Token
const API_BASE = window.NtouConfig?.apiBase || 'http://127.0.0.1:8000/api';
const MANAGER_ROLES = ['admin', 'event_manager'];
const ROLE_LABELS = { admin: '系統管理員', event_manager: '活動管理者', user: '一般使用者' };
const TIME_FIELDS = ['registration_opens_at', 'registration_closes_at', 'starts_at', 'ends_at'];
const TEXT_FIELDS = [
  { name: 'title', label: '活動名稱', max: 100 },
  { name: 'description', label: '活動說明' },
  { name: 'location', label: '活動地點', max: 200 }
];
const TIME_LABELS = {
  registration_opens_at: '報名開始時間',
  registration_closes_at: '報名截止時間',
  starts_at: '活動開始時間',
  ends_at: '活動結束時間'
};

const $ = selector => document.querySelector(selector);
const loginPanel = $('#login-panel');
const editorPanel = $('#editor-panel');
const form = $('#event-form');
const picker = $('#event-picker');
const submitButton = $('#submit-button');

// 目前編輯中的活動編號；null 代表建立新活動
let editingId = null;

/* ---------- 登入狀態（共用 NtouSession，只保存 Token；關閉分頁即清除） ---------- */
// 從 Token 解出姓名與角色只用於畫面顯示；實際權限一律由後端驗證。
function decodeTokenUser(token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(Array.from(atob(payload), c => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''));
    const { id, name, email, role } = JSON.parse(json);
    return { id, name, email, role };
  } catch {
    return null;
  }
}
function readAuth() {
  const token = window.NtouSession?.getToken() || '';
  const user = token ? decodeTokenUser(token) : null;
  return token && user ? { token, user } : null;
}
function saveAuth(auth) {
  try {
    if (auth) window.NtouSession.setToken(auth.token);
    else window.NtouSession.clear();
  } catch { /* 儲存不可用時僅本頁有效 */ }
}

function setStatus(node, type, message) {
  node.textContent = message || '';
  if (type && message) node.dataset.type = type; else delete node.dataset.type;
}

/* ---------- 時間轉換 (Asia/Taipei 固定 UTC+8，無日光節約) ---------- */
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;
function localInputToIso(value) {
  // "2026-11-20T17:00" -> "2026-11-20T17:00:00+08:00"
  return value ? `${value}:00+08:00` : '';
}
function isoToLocalInput(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '';
  return new Date(date.getTime() + TAIPEI_OFFSET_MS).toISOString().slice(0, 16);
}

/* ---------- API ---------- */
async function api(path, options = {}) {
  const auth = readAuth();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (auth?.token) headers.Authorization = `Bearer ${auth.token}`;
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    throw new Error('無法連線到後端服務，請確認後端已啟動。');
  }
  let body = null;
  try { body = await response.json(); } catch { /* 非 JSON 回應 */ }
  if (!response.ok) {
    const error = new Error(body?.error || `操作失敗（HTTP ${response.status}）`);
    error.status = response.status;
    throw error;
  }
  return body;
}

/* ---------- 畫面切換 ---------- */
function showView() {
  const auth = readAuth();
  const isManager = auth && MANAGER_ROLES.includes(auth.user?.role);
  loginPanel.hidden = isManager;
  editorPanel.hidden = !isManager;
  if (auth && !isManager) {
    setStatus($('#login-status'), 'error', `目前登入的帳號（${auth.user?.name || auth.user?.email}）為${ROLE_LABELS[auth.user?.role] || '一般使用者'}，沒有建立或編輯活動的權限。請改用管理者帳號登入。`);
  }
  if (isManager) {
    $('#account-info').textContent = `目前登入：${auth.user.name}（${ROLE_LABELS[auth.user.role]}）`;
    loadEventOptions();
  }
}

$('#login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const email = $('#login-email').value.trim();
  const password = $('#login-password').value;
  const status = $('#login-status');
  if (!email || !password) {
    setStatus(status, 'error', '請輸入電子信箱與密碼。');
    return;
  }
  setStatus(status, 'loading', '登入中…');
  try {
    const result = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    saveAuth({ token: result.token, user: result.user });
    $('#login-password').value = '';
    setStatus(status, '', '');
    showView();
  } catch (error) {
    setStatus(status, 'error', error.message);
  }
});

$('#logout').addEventListener('click', () => {
  saveAuth(null);
  setStatus($('#login-status'), '', '');
  setStatus($('#form-status'), '', '');
  showView();
});

/* ---------- 選擇編輯活動 ---------- */
async function refreshOptions() {
  const status = $('#picker-status');
  setStatus(status, '', '載入活動清單中…');
  try {
    const result = await api('/events');
    const options = (result.data || []).map(item => {
      const option = document.createElement('option');
      option.value = String(item.id);
      option.textContent = `#${item.id} ${item.title}${item.is_published ? '' : '（未公開）'}`;
      return option;
    });
    picker.replaceChildren(picker.options[0], ...options);
    setStatus(status, '', '');
  } catch (error) {
    setStatus(status, '', `活動清單載入失敗：${error.message}`);
  }
  if (editingId) picker.value = String(editingId);
}

// 進入頁面時載入清單；網址帶 ?id= 則直接進入編輯模式
async function loadEventOptions() {
  await refreshOptions();
  const id = Number(new URLSearchParams(location.search).get('id'));
  if (Number.isInteger(id) && id > 0) await loadEvent(id);
}

picker.addEventListener('change', () => {
  setStatus($('#form-status'), '', '');
  if (picker.value) loadEvent(Number(picker.value)); else startCreate();
});

async function loadEvent(id) {
  setStatus($('#form-status'), 'loading', '載入活動資料中…');
  try {
    const item = await api(`/events/${id}`);
    fillForm(item);
    setEditing(item.id);
    setStatus($('#form-status'), '', '');
  } catch (error) {
    setStatus($('#form-status'), 'error', `無法載入活動：${error.message}`);
  }
}

function fillForm(item) {
  clearErrors();
  for (const { name } of TEXT_FIELDS) form.elements[name].value = item[name] || '';
  for (const name of TIME_FIELDS) form.elements[name].value = isoToLocalInput(item[name]);
  form.elements.is_published.checked = item.is_published === true;
}

function setEditing(id) {
  editingId = id;
  picker.value = id ? String(id) : '';
  $('#form-title').textContent = id ? `編輯活動 #${id}` : '建立活動';
  submitButton.textContent = id ? '儲存修改' : '建立活動';
  $('#reset-button').textContent = id ? '還原為已儲存內容' : '清空表單';
  const url = new URL(location.href);
  id ? url.searchParams.set('id', id) : url.searchParams.delete('id');
  try { history.replaceState(null, '', url); } catch { /* file:// 可能不支援 */ }
}

function startCreate() {
  form.reset();
  clearErrors();
  setEditing(null);
}

$('#reset-button').addEventListener('click', () => {
  setStatus($('#form-status'), '', '');
  if (editingId) loadEvent(editingId); else startCreate();
});

/* ---------- 表單驗證 ---------- */
function clearErrors() {
  form.querySelectorAll('[aria-invalid]').forEach(node => node.removeAttribute('aria-invalid'));
  form.querySelectorAll('.field-error').forEach(node => { node.textContent = ''; });
}

function setError(name, message) {
  const input = form.elements[name];
  input.setAttribute('aria-invalid', 'true');
  $(`#${name}-error`).textContent = message;
}

// 前端檢查僅為提示，後端仍會再驗證一次
function validate() {
  clearErrors();
  const errors = [];
  const add = (name, message) => { if (!errors.some(e => e.name === name)) errors.push({ name, message }); };

  for (const { name, label, max } of TEXT_FIELDS) {
    const value = form.elements[name].value.trim();
    if (!value) add(name, `請填寫${label}。`);
    else if (max && value.length > max) add(name, `${label}不可超過 ${max} 字。`);
  }
  const times = {};
  for (const name of TIME_FIELDS) {
    const value = form.elements[name].value;
    if (!value) add(name, `請填寫${TIME_LABELS[name]}。`);
    else times[name] = new Date(localInputToIso(value)).getTime();
  }
  const { registration_opens_at: opens, registration_closes_at: closes, starts_at: starts, ends_at: ends } = times;
  if (opens && closes && closes <= opens) add('registration_closes_at', '報名截止時間必須晚於報名開始時間。');
  if (closes && starts && closes > starts) add('registration_closes_at', '報名截止時間不可晚於活動開始時間。');
  if (starts && ends && ends <= starts) add('ends_at', '活動結束時間必須晚於活動開始時間。');

  errors.forEach(({ name, message }) => setError(name, message));
  return errors;
}

function collectPayload() {
  const payload = {};
  for (const { name } of TEXT_FIELDS) payload[name] = form.elements[name].value.trim();
  for (const name of TIME_FIELDS) payload[name] = localInputToIso(form.elements[name].value);
  payload.is_published = form.elements.is_published.checked;
  return payload;
}

/* ---------- 送出：建立或修改 ---------- */
form.addEventListener('submit', async event => {
  event.preventDefault();
  const status = $('#form-status');
  const errors = validate();
  if (errors.length) {
    setStatus(status, 'error', `有 ${errors.length} 個欄位需要修正，請檢查標示紅色的欄位。`);
    form.elements[errors[0].name].focus();
    return;
  }

  const isEdit = editingId !== null;
  submitButton.disabled = true;
  setStatus(status, 'loading', isEdit ? '儲存修改中…' : '建立活動中…');
  try {
    const result = await api(isEdit ? `/events/${editingId}` : '/events', {
      method: isEdit ? 'PUT' : 'POST',
      body: JSON.stringify(collectPayload())
    });
    const saved = result.data;
    fillForm(saved);
    setEditing(saved.id);
    await refreshOptions();
    setStatus(status, 'success', `${result.message || (isEdit ? '活動更新成功' : '活動建立成功')}：#${saved.id}「${saved.title}」，目前狀態為${saved.is_published ? '已公開' : '未公開'}。`);
  } catch (error) {
    if (error.status === 401) {
      saveAuth(null);
      showView();
      setStatus($('#login-status'), 'error', '登入已失效，請重新登入後再送出。');
      return;
    }
    setStatus(status, 'error', `${isEdit ? '修改' : '建立'}失敗：${error.message}`);
  } finally {
    submitButton.disabled = false;
  }
});

showView();

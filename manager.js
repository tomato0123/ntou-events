(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const eventSelect = byId('managed-event');
  const statusSelect = byId('registration-status');
  const refresh = byId('refresh-roster');
  const retry = byId('retry-roster');
  const message = byId('roster-message');
  const body = byId('roster-body');
  const count = byId('roster-count');
  const region = byId('roster-region');
  const session = window.NtouSession;
  const dateFormat = new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  });
  let events = [];
  let version = 0;
  let controller;
  let retryAction = loadEvents;

  function date(value) {
    if (!value || !Number.isFinite(new Date(value).getTime())) return '未提供';
    return dateFormat.format(new Date(value));
  }
  function clearRoster() {
    body.replaceChildren();
    count.textContent = '';
    byId('roster-results').hidden = true;
    retry.hidden = true;
  }
  function notice(text, kind = 'info') {
    message.classList.remove('sr-only');
    message.textContent = text;
    message.dataset.kind = kind;
    message.hidden = false;
  }
  function invalidate() {
    version++;
    controller?.abort();
    clearRoster();
    region.setAttribute('aria-busy', 'false');
  }
  function begin(text) {
    invalidate();
    controller = new AbortController();
    region.setAttribute('aria-busy', 'true');
    notice(text);
    return { version, controller, token: session.getToken() };
  }
  function current(request) {
    return request.version === version && request.token === session.getToken();
  }
  function resetEvents(text) {
    events = [];
    eventSelect.replaceChildren(new Option(text, ''));
    eventSelect.disabled = true;
    statusSelect.disabled = true;
    refresh.disabled = true;
    byId('selected-event').hidden = true;
    byId('selected-title').textContent = '';
    byId('selected-meta').textContent = '';
  }
  function signedOut() {
    invalidate();
    resetEvents('請先登入');
    byId('sign-out').hidden = true;
    notice('請先登入具有活動管理權限的帳號，再查看報名名單。');
  }
  async function requestJson(path, request) {
    const timeout = setTimeout(() => request.controller.abort(), 15000);
    try {
      const response = await fetch(`${window.NtouConfig.apiBase}${path}`, {
        headers: { Authorization: `Bearer ${request.token}` },
        signal: request.controller.signal, cache: 'no-store'
      });
      if (!response.ok) {
        const error = new Error('request failed');
        error.status = response.status;
        throw error;
      }
      return await response.json();
    } finally { clearTimeout(timeout); }
  }
  function failure(error, request) {
    if (!current(request)) return;
    clearRoster();
    if (error.status === 401) {
      // 過期的回應不可清除新登入者的 Token；current() 已核對本次身分。
      session.clear();
      notice('登入已失效，請重新登入後查看報名名單。', 'error');
    } else if (error.status === 403) {
      resetEvents('目前無查看權限');
      notice('您目前沒有查看此活動名單的權限，請確認帳號或聯絡活動負責人。', 'error');
      retryAction = loadEvents;
      retry.hidden = false;
    } else if (error.status === 404) {
      resetEvents('找不到活動');
      notice('找不到此活動，可能已被移除。請重新載入活動列表。', 'error');
      retryAction = loadEvents;
      retry.hidden = false;
    } else {
      notice(error.name === 'AbortError' ? '載入逾時，請重試。' : '無法載入資料，請檢查網路連線後重試。', 'error');
      retry.hidden = false;
    }
  }
  async function loadEvents() {
    if (!session.getToken()) return signedOut();
    byId('sign-out').hidden = false;
    const previous = eventSelect.value;
    const request = begin('正在載入可管理的活動…');
    retryAction = loadEvents;
    resetEvents('載入活動中…');
    try {
      const json = await requestJson('/manage/events', request);
      if (!current(request)) return;
      if (!Array.isArray(json.data) || json.data.some(e => !Number.isInteger(e.id) || e.id <= 0 || typeof e.title !== 'string')) throw new Error('invalid events');
      events = json.data;
      if (!events.length) {
        resetEvents('目前沒有可管理的活動');
        refresh.disabled = false;
        notice('目前沒有可管理的活動。若您已被指定為負責人，請聯絡系統管理員確認。');
        return;
      }
      eventSelect.replaceChildren(...events.map(e => new Option(`${e.title}（#${e.id}）`, String(e.id))));
      eventSelect.value = events.some(e => String(e.id) === previous) ? previous : String(events[0].id);
      eventSelect.disabled = false;
      statusSelect.disabled = false;
      refresh.disabled = false;
      await loadRoster();
    } catch (error) { failure(error, request); }
    finally { if (current(request)) region.setAttribute('aria-busy', 'false'); }
  }
  async function loadRoster() {
    if (!session.getToken()) return signedOut();
    const event = events.find(e => String(e.id) === eventSelect.value);
    if (!event) return loadEvents();
    const selectedStatus = statusSelect.value;
    const request = begin('正在載入報名名單…');
    retryAction = loadRoster;
    byId('selected-event').hidden = false;
    byId('selected-title').textContent = event.title;
    byId('selected-meta').textContent = `${date(event.starts_at)} – ${date(event.ends_at)}（臺北時間） · ${event.location || '未提供地點'}`;
    try {
      const suffix = selectedStatus ? `?status=${encodeURIComponent(selectedStatus)}` : '';
      const json = await requestJson(`/events/${event.id}/registrations${suffix}`, request);
      if (!current(request)) return;
      if (json.event_id !== event.id || !Array.isArray(json.data) || json.total_count !== json.data.length ||
          json.data.some(r => !r.user || !Number.isInteger(r.registration_id) || !['registered', 'cancelled'].includes(r.status))) throw new Error('invalid roster');
      count.textContent = `目前顯示 ${json.total_count} 筆 · ${statusSelect.selectedOptions[0].textContent}`;
      if (selectedStatus !== 'cancelled') {
        const registeredUsers = new Set(json.data.filter(r => r.status === 'registered').map(r => r.user.id));
        count.textContent += ` · 已報名 ${registeredUsers.size} 人`;
      }
      if (!json.data.length) {
        notice(selectedStatus ? '目前沒有符合此狀態的報名紀錄。' : '目前尚無報名者。');
        return;
      }
      const identities = { student: '學生', teacher: '教師', staff: '行政人員' };
      const rows = json.data.map(record => {
        const tr = document.createElement('tr');
        const values = [record.registration_id, record.user.name, record.user.email,
          identities[record.user.campus_identity] || record.user.campus_identity, record.user.gender,
          record.status === 'registered' ? '已報名' : '已取消', date(record.registered_at)];
        values.forEach((value, index) => {
          const td = document.createElement('td');
          const text = value == null || value === '' ? '未提供' : String(value);
          if (index === 5) {
            const badge = document.createElement('span');
            badge.className = `status-badge ${record.status}`;
            badge.textContent = text;
            td.append(badge);
          } else td.textContent = text;
          tr.append(td);
        });
        return tr;
      });
      body.replaceChildren(...rows);
      byId('roster-caption').textContent = `${event.title} · ${statusSelect.selectedOptions[0].textContent}`;
      byId('roster-results').hidden = false;
      // 保留 live region 宣告載入完成；視覺上由筆數呈現。
      message.textContent = `名單載入完成，共 ${json.total_count} 筆。`;
      message.classList.add('sr-only');
    } catch (error) { failure(error, request); }
    finally { if (current(request)) region.setAttribute('aria-busy', 'false'); }
  }

  eventSelect.addEventListener('change', loadRoster);
  statusSelect.addEventListener('change', loadRoster);
  refresh.addEventListener('click', loadEvents);
  retry.addEventListener('click', () => retryAction());
  byId('sign-out').addEventListener('click', () => session.clear());
  window.addEventListener('ntou:session-change', () => {
    statusSelect.value = '';
    resetEvents('請稍候');
    loadEvents();
  });
  // 離開、切換帳號或背景分頁時移除名單；返回時重新查核目前權限。
  window.addEventListener('pagehide', invalidate);
  window.addEventListener('pageshow', event => { if (event.persisted) loadEvents(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) invalidate();
    else loadEvents();
  });
  loadEvents();
})();

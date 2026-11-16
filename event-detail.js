(() => {
  'use strict';

  const API_BASE = window.NtouConfig?.apiBase || 'http://127.0.0.1:8000/api';

  const MOCK_EVENTS = {
    1: {
      id: 1,
      title: '【Mock 測試】海大校園搖滾音樂祭：海風之夜',
      organizer: '熱音社 × 學生會',
      location: '展示廳前廣場（雨備：育樂館）',
      starts_at: '2026-12-20T18:00:00+08:00',
      ends_at: '2026-12-20T21:30:00+08:00',
      registration_opens_at: '2026-11-01T09:00:00+08:00',
      registration_closes_at: '2026-12-19T23:59:00+08:00',
      description: '一年一度的海風之夜又來啦！\n\n本次邀請到多組校內外獨立樂團輪番演出，現場備有限量免費飲品與闖關抽獎活動。\n\n【注意事項】\n1. 請攜帶學生證入場簽到。\n2. 活動前 30 分鐘開放進場。'
    },
    2: {
      id: 2,
      title: '【Mock 測試】AI 與全端網頁開發實戰工作坊（已截止範例）',
      organizer: '資訊工程學系系學會',
      location: '資工系館 302 電腦教室',
      starts_at: '2026-10-10T13:30:00+08:00',
      ends_at: '2026-10-10T16:30:00+08:00',
      registration_opens_at: '2026-10-01T00:00:00+08:00',
      registration_closes_at: '2026-10-09T23:59:00+08:00',
      description: '透過三小時的實作，帶你從零打造串接 RESTful API 的前端介面。此為測試「報名已截止」狀態的假資料。'
    }
  };

  const loadingEl = document.querySelector('#page-loading');
  const errorEl = document.querySelector('#page-error');
  const errorTextEl = document.querySelector('#page-error-text');
  const detailBox = document.querySelector('#event-detail-box');

  const posterTitleEl = document.querySelector('#poster-title');
  const titleEl = document.querySelector('#event-title');
  const organizerEl = document.querySelector('#event-organizer');
  const timeEl = document.querySelector('#event-time');
  const locationEl = document.querySelector('#event-location');
  const regPeriodEl = document.querySelector('#event-reg-period');
  const descEl = document.querySelector('#event-description');

  const statusTextEl = document.querySelector('#event-status-text');
  const registerBtn = document.querySelector('#register-btn');
  const messageBox = document.querySelector('#status-message-box');

  // ===== 帳號服務彈窗綁定（與首頁 app.js 一致）=====
  const dialog = document.querySelector('#event-dialog');
  const closeDialogBtn = document.querySelector('#close-dialog');

  function openAccountDialog() {
    if (!dialog) return;
    const catEl = document.querySelector('#dialog-category');
    const dlgTitleEl = document.querySelector('#dialog-title');
    const bodyEl = document.querySelector('#dialog-body');
    if (catEl) catEl.textContent = '帳號服務';
    if (dlgTitleEl) dlgTitleEl.textContent = '登入與我的報名';
    if (bodyEl && typeof document.createElement === 'function') {
      const p = document.createElement('p');
      p.className = 'dialog-description';
      p.textContent = '登入與報名功能將在後續階段開放。';
      bodyEl.replaceChildren(p);
    }
    if (!dialog.open && typeof dialog.showModal === 'function') {
      dialog.showModal();
    }
  }

  if (closeDialogBtn && dialog) {
    closeDialogBtn.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => {
      if (event.target === dialog && typeof dialog.getBoundingClientRect === 'function') {
        const bounds = dialog.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        ) {
          dialog.close();
        }
      }
    });
  }

  if (typeof document.querySelectorAll === 'function') {
    document.querySelectorAll('[data-account]').forEach(btn => {
      btn.addEventListener('click', openAccountDialog);
    });
  }

  // ===== 時間格式化（Asia/Taipei）=====
  const dateFormat = new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short'
  });
  const timeFormat = new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  function formatRange(startIso, endIso) {
    const start = new Date(startIso);
    const end = new Date(endIso);
    return `${dateFormat.format(start)} ${timeFormat.format(start)}–${timeFormat.format(end)}`;
  }

  function getEventStatus(event) {
    const now = Date.now();
    const closeTime = event.registration_closes_at
      ? new Date(event.registration_closes_at).getTime()
      : new Date(event.starts_at).getTime();

    if (now >= new Date(event.ends_at).getTime()) return { text: '已結束', open: false };
    if (now >= new Date(event.starts_at).getTime()) return { text: '進行中', open: false };
    if (event.registration_opens_at && now < new Date(event.registration_opens_at).getTime()) {
      return { text: '尚未開放報名', open: false };
    }
    if (now >= closeTime) return { text: '報名已截止', open: false };
    return { text: '報名開放中', open: true };
  }

  function setMessage(type, text) {
    messageBox.className = `status-message-box${type ? ` ${type}` : ''}`;
    messageBox.textContent = text;
  }

  function renderEvent(event, isMock = false) {
    const currentStatus = getEventStatus(event);

    document.title = `${event.title}｜海大活動報名系統`;
    posterTitleEl.textContent = event.title;
    titleEl.textContent = event.title;
    organizerEl.textContent = event.organizer || '國立臺灣海洋大學';
    timeEl.textContent = formatRange(event.starts_at, event.ends_at);
    locationEl.textContent = event.location;

    if (event.registration_opens_at && event.registration_closes_at) {
      regPeriodEl.textContent = `${dateFormat.format(new Date(event.registration_opens_at))} ${timeFormat.format(new Date(event.registration_opens_at))} – ${dateFormat.format(new Date(event.registration_closes_at))} ${timeFormat.format(new Date(event.registration_closes_at))}`;
    } else {
      regPeriodEl.textContent = '即日起至活動開始前';
    }

    descEl.textContent = event.description;

    statusTextEl.textContent = currentStatus.text;
    statusTextEl.className = `status-tag${currentStatus.open ? '' : ' closed'}`;

    if (!currentStatus.open) {
      registerBtn.disabled = true;
      registerBtn.textContent = '報名已截止';
      setMessage('', `此活動目前狀態為「${currentStatus.text}」，不開放線上報名。`);
    } else if (isMock) {
      registerBtn.disabled = false;
      registerBtn.textContent = '報名活動';
      setMessage('', '【Mock 測試模式】目前使用前端假資料展示，可直接點擊「報名活動」測試成功訊息 UI！');
    } else if (!window.NtouSession?.getToken()) {
      registerBtn.disabled = false;
      registerBtn.textContent = '報名活動';
      setMessage('', '請先登入帳號以進行活動報名。');
    } else {
      registerBtn.disabled = false;
      registerBtn.textContent = '報名活動';
      setMessage('', '目前開放報名中，點擊「報名活動」即可送出報名。');
    }

    registerBtn.onclick = async () => {
      if (isMock) {
        registerBtn.disabled = true;
        registerBtn.textContent = '報名處理中…';
        await new Promise(resolve => setTimeout(resolve, 300));
        registerBtn.textContent = '已報名';
        setMessage('success', '🎉 【Mock 測試】報名成功！UI 狀態列與訊息顯示區運作正常。');
        return;
      }

      const token = window.NtouSession?.getToken();
      if (!token) {
        setMessage('error', '尚未登入：請先登入帳號後再報名活動。');
        return;
      }

      registerBtn.disabled = true;
      registerBtn.textContent = '報名處理中…';

      try {
        const res = await fetch(`${API_BASE}/events/${encodeURIComponent(event.id)}/registrations`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          }
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `報名失敗（HTTP ${res.status}）`);

        registerBtn.textContent = '已報名';
        setMessage('success', data.message || '報名成功！已將您加入此活動名單。');
      } catch (err) {
        registerBtn.disabled = false;
        registerBtn.textContent = '報名活動';
        setMessage('error', `報名失敗：${err.message}`);
      }
    };

    loadingEl.hidden = true;
    detailBox.hidden = false;
  }

  async function init() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id') || '1';
    const useMock = params.get('mock') === '1';

    if (useMock) {
      renderEvent(MOCK_EVENTS[id] || MOCK_EVENTS[1], true);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/events/${encodeURIComponent(id)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      renderEvent(data, false);
    } catch (err) {
      console.warn('後端或資料庫尚無此活動，自動切換為 Mock UI 預覽模式：', err.message);
      renderEvent(MOCK_EVENTS[id] || MOCK_EVENTS[1], true);
    }
  }

  init();
})();
(() => {
  'use strict';
  // 內建後端注入 /api，支援任意 PORT。獨立前端可在載入本檔前設定可信 NtouConfig。
  // 不從 query string 接受 API 主機；本機分離部署預設使用 8000。
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const fallback = location.protocol === 'file:' || (local && location.port !== '8000')
    ? 'http://127.0.0.1:8000/api' : '/api';
  const apiBase = window.NtouConfig?.apiBase || fallback;
  window.NtouConfig = Object.freeze({ apiBase });
  window.NTOU_API_BASE = apiBase; // UI-03 舊名稱相容；所有正式頁面使用 NtouConfig。
})();

(() => {
  'use strict';
  // 本機 Live Server 可獨立提供前端；正式部署與內建靜態頁面使用同源 API。
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const apiBase = location.protocol === 'file:' || (local && location.port !== '8000')
    ? 'http://127.0.0.1:8000/api' : '/api';
  window.NtouConfig = Object.freeze({ apiBase });
})();

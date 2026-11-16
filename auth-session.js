(() => {
  'use strict';
  // US-02 串接點：只保存 Token，不使用前端角色作為授權依據。
  // sessionStorage 只在目前分頁存續；不保存報名名單或個資。
  const key = 'ntou.auth.token';
  const read = () => {
    try { return sessionStorage.getItem(key) || ''; } catch { return ''; }
  };
  const update = token => {
    if (typeof token !== 'string') throw new TypeError('Token 必須是字串');
    if (token) sessionStorage.setItem(key, token);
    else sessionStorage.removeItem(key);
    window.dispatchEvent(new Event('ntou:session-change'));
  };
  window.NtouSession = Object.freeze({ getToken: read, setToken: update, clear: () => update('') });
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) window.dispatchEvent(new Event('ntou:session-change'));
  });
})();

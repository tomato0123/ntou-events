(() => {
  const bar = document.createElement('aside');
  bar.style.cssText = 'padding:12px;background:#fff2d6;display:flex;gap:12px;align-items:center;flex-wrap:wrap;font:14px sans-serif';
  const label = document.createElement('strong');
  label.textContent = '獨立測試環境・資料皆為虛構';
  bar.append(label);
  const roles = [['owner', '管理者 A'], ['other', '管理者 B'], ['admin', '系統管理員'], ['user', '一般使用者'], ['empty', '無活動管理者'], ['guest', '訪客']];
  for (const [role, title] of roles) {
    const button = document.createElement('button');
    button.textContent = title;
    button.onclick = async () => {
      await fetch('/__test__/mode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'normal' }) });
      const response = await fetch('/__test__/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) });
      window.NtouSession.setToken((await response.json()).token);
    };
    bar.append(button);
  }
  document.body.prepend(bar);
})();

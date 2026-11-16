(async () => {
  const frame = document.getElementById('subject');
  const output = document.getElementById('results');
  const results = [];
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async predicate => {
    const deadline = Date.now() + 6000;
    while (!predicate()) {
      if (Date.now() > deadline) throw new Error('等待畫面狀態逾時');
      await pause(25);
    }
  };
  const pass = name => { results.push(`PASS ${name}`); output.textContent = results.join('\n'); };
  const check = (value, name) => { if (!value) throw new Error(name); pass(name); };
  const post = async (path, data) => (await fetch(path, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })).json();
  try {
    await wait(() => frame.contentWindow.NtouSession && frame.contentDocument.getElementById('roster-message'));
    const win = frame.contentWindow;
    const doc = frame.contentDocument;
    const el = id => doc.getElementById(id);
    const rows = () => el('roster-body').children.length;
    const settled = () => el('roster-region').getAttribute('aria-busy') === 'false';
    const login = async role => win.NtouSession.setToken((await post('/__test__/session', { role })).token);
    const mode = value => post('/__test__/mode', { mode: value });
    const select = (id, value) => { el(id).value = value; el(id).dispatchEvent(new win.Event('change')); };
    await mode('normal');
    win.NtouSession.clear();
    check(el('roster-message').textContent.includes('請先登入') && rows() === 0, '訪客提示且沒有名單');
    await login('owner');
    await wait(() => settled() && rows() === 3);
    check(el('managed-event').options.length === 2, '管理者只看本人活動');
    check(el('roster-count').textContent.includes('3 筆') && el('roster-count').textContent.includes('已報名 2 人'), '名單筆數與有效報名人數分開顯示');
    check(el('roster-body').textContent.includes('<img src=x onerror=alert(1)>') && !el('roster-body').querySelector('img'), '姓名以純文字顯示，不能注入 HTML');
    check(el('roster-body').textContent.includes('未提供') && el('roster-body').textContent.includes('學生'), '缺漏欄位與校園身分中文顯示');
    check(el('roster-body').textContent.includes('08:00'), '報名時間以 Asia/Taipei 顯示');
    select('registration-status', 'cancelled');
    check(rows() === 0, '篩選請求開始即清除舊名單');
    await wait(() => settled() && rows() === 1);
    check(el('roster-body').textContent.includes('已取消'), '已取消篩選');
    select('registration-status', 'registered');
    await wait(() => settled() && rows() === 2);
    pass('已報名篩選');
    select('managed-event', '202');
    await wait(() => settled() && el('roster-count').textContent.includes('0 筆'));
    check(el('roster-message').textContent.includes('符合此狀態'), '篩選空名單不顯示為錯誤');
    select('registration-status', '');
    await wait(() => settled() && el('roster-message').textContent.includes('尚無報名者'));
    pass('活動空名單提示');
    el('refresh-roster').click();
    await wait(() => settled() && el('managed-event').value === '202');
    pass('重新整理保留選取活動');
    await login('admin');
    await wait(() => settled() && el('managed-event').options.length === 4);
    check([...el('managed-event').options].some(o => o.value === '204'), 'admin 可選未指定負責人的活動');
    await login('other');
    await wait(() => settled() && el('managed-event').value === '203');
    check(el('managed-event').options.length === 1, '切換帳號後清除前一帳號活動與名單');
    await login('user');
    await wait(() => settled() && el('roster-message').textContent.includes('沒有查看'));
    check(rows() === 0 && el('managed-event').disabled, '一般使用者 403 不顯示資料');
    await login('empty');
    await wait(() => settled() && el('roster-message').textContent.includes('沒有可管理'));
    pass('無可管理活動與空報名名單分開提示');
    await mode('error');
    await login('owner');
    await wait(() => settled() && !el('retry-roster').hidden);
    check(rows() === 0 && el('roster-count').textContent === '', '伺服器失敗不顯示為零筆或舊名單');
    await mode('normal');
    el('retry-roster').click();
    await wait(() => settled() && rows() === 3);
    pass('錯誤後可重試恢復');
    for (const [value, text] of [['forbidden', '沒有查看'], ['missing', '找不到此活動'], ['malformed', '無法載入資料'], ['expired', '登入已失效']]) {
      await mode(value);
      el('refresh-roster').click();
      await wait(() => settled() && el('roster-message').textContent.includes(text));
      check(rows() === 0, `${value} 回應清除名單且顯示對應提示`);
      await mode('normal');
      await login('owner');
      await wait(() => settled() && rows() === 3);
    }
    await mode('slow');
    select('registration-status', 'cancelled');
    select('registration-status', 'registered');
    await wait(() => settled() && rows() === 2);
    await pause(800);
    check(rows() === 2 && !el('roster-body').textContent.includes('已取消'), '快速切換篩選不被舊回應覆蓋');
    select('registration-status', '');
    win.NtouSession.clear();
    await pause(900);
    check(rows() === 0 && el('roster-message').textContent.includes('請先登入'), '請求途中登出後舊回應不能恢復個資');
    await mode('normal');
    output.textContent += `\n完成：${results.length} 項通過，0 項失敗（mock HTTP，非真實資料庫）`;
    document.title = 'PASS UI-06 前端驗收';
  } catch (error) {
    output.textContent += `\nFAIL ${error.message}`;
    document.title = 'FAIL UI-06 前端驗收';
  }
})();

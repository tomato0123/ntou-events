// 示範資料；串接後端時可將此陣列替換為活動 API 的回傳資料。
const events = [
  { id: 1, category: '學術', title: '海洋永續・從校園開始的藍色行動', description: '一起認識海洋環境，探索我們能實踐的永續日常。', start: '2026-11-05T14:00:00+08:00', end: '2026-11-05T16:00:00+08:00', location: '行政大樓・第一演講廳', organizer: '海洋環境研究社', capacity: 80, registered: 36, published: '2026-10-12' }
];

const state = { category: '全部', query: '', visible: 6 };
const grid = document.querySelector('#event-grid');
const search = document.querySelector('#search');
const dialog = document.querySelector('#event-dialog');
const dateFormat = new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', weekday: 'short' });
const timeFormat = new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false });
function eventTime(event) {
  return `${dateFormat.format(new Date(event.start))} ${timeFormat.format(new Date(event.start))}–${timeFormat.format(new Date(event.end))}`;
}
function status(event) {
  if (Date.now() >= new Date(event.end).getTime()) return '已結束';
  if (Date.now() >= new Date(event.start).getTime()) return '報名截止';
  return event.registered >= event.capacity ? '已額滿' : '開放報名';
}
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function card(event) {
  const article = element('article', 'event-card');
  const top = element('div', 'card-top');
  const badge = element('span', 'category-badge', event.category);
  badge.dataset.category = event.category;
  const currentStatus = status(event);
  top.append(badge, element('span', `event-status${currentStatus === '開放報名' ? '' : ' closed'}`, `${currentStatus === '開放報名' ? '● ' : ''}${currentStatus}`));
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
  details.addEventListener('click', () => showEvent(event));
  bottom.append(element('span', 'seats', `${event.registered} / ${event.capacity} 人已報名`), details);
  article.append(top, element('h3', '', event.title), element('p', 'event-description', event.description), meta, bottom);
  return article;
}
function render() {
  const query = state.query.toLocaleLowerCase('zh-TW');
  const matches = events.filter(event => new Date(event.end).getTime() > Date.now() &&
    (state.category === '全部' || event.category === state.category) &&
    `${event.title} ${event.description} ${event.location} ${event.organizer}`.toLocaleLowerCase('zh-TW').includes(query))
    .sort((a, b) => b.published.localeCompare(a.published));
  grid.replaceChildren(...matches.slice(0, state.visible).map(card));
  document.querySelector('#result-count').textContent = `共 ${matches.length} 場活動${state.query ? ` · 搜尋「${state.query}」` : ''}`;
  document.querySelector('#empty-state').hidden = matches.length !== 0;
  document.querySelector('#load-more').hidden = state.visible >= matches.length;
  document.querySelectorAll('[data-category]').forEach(button => {
    if (button.tagName === 'BUTTON') button.setAttribute('aria-pressed', String(button.dataset.category === state.category));
  });
}
function syncUrl() {
  const url = new URL(window.location.href);
  state.query ? url.searchParams.set('q', state.query) : url.searchParams.delete('q');
  state.category !== '全部' ? url.searchParams.set('category', state.category) : url.searchParams.delete('category');
  // 某些瀏覽器限制 file:// 的 history API；不影響本機篩選。
  try { window.history.replaceState(null, '', url); } catch { /* 本機檔案保持可用。 */ }
}
function readUrl() {
  const params = new URLSearchParams(window.location.search);
  state.query = (params.get('q') || '').trim();
  state.category = ['學術', '社團', '體育', '其他'].includes(params.get('category')) ? params.get('category') : '全部';
  state.visible = 6;
  search.value = state.query;
  render();
}
function showEvent(event) {
  document.querySelector('#dialog-category').textContent = `${event.category} / ${status(event)}`;
  document.querySelector('#dialog-title').textContent = event.title;
  const info = element('dl');
  for (const [label, value] of [['日期時間', `${new Date(event.start).getFullYear()} / ${eventTime(event)}`], ['活動地點', event.location], ['主辦單位', event.organizer], ['報名人數', `${event.registered} / ${event.capacity} 人`]]) {
    info.append(element('dt', '', label), element('dd', '', value));
  }
  document.querySelector('#dialog-body').replaceChildren(info, element('p', 'dialog-description', event.description), element('p', 'dialog-notice', '此為示範活動，並非正式校園公告。登入及報名功能尚未開放。'));
  dialog.showModal();
}
document.querySelector('#search-form').addEventListener('submit', event => {
  event.preventDefault(); state.query = search.value.trim(); state.visible = 6; syncUrl(); render();
});
search.addEventListener('input', () => {
  if (search.value === '') { state.query = ''; state.visible = 6; syncUrl(); render(); }
});
document.querySelector('#categories').addEventListener('click', event => {
  const button = event.target.closest('button[data-category]');
  if (!button) return;
  state.category = button.dataset.category; state.visible = 6; syncUrl(); render();
});
document.querySelector('#clear-filters').addEventListener('click', () => {
  state.category = '全部'; state.query = ''; state.visible = 6; search.value = ''; syncUrl(); render(); search.focus();
});
document.querySelector('#load-more').addEventListener('click', () => {
  const previousCount = grid.children.length;
  state.visible += 6; render();
  grid.children[previousCount]?.querySelector('button').focus();
});
document.querySelector('#close-dialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) { const bounds = dialog.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close(); } });
document.querySelectorAll('[data-account]').forEach(button => button.addEventListener('click', () => {
  document.querySelector('#dialog-category').textContent = '帳號服務';
  document.querySelector('#dialog-title').textContent = '登入與我的報名';
  document.querySelector('#dialog-body').replaceChildren(element('p', 'dialog-description', '帳號服務尚未開放。你可以先搜尋、篩選活動，並查看活動詳情。'));
  dialog.showModal();
}));
window.addEventListener('popstate', readUrl);
readUrl();

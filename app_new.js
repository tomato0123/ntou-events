const state = { category: '全部', query: '', visible: 6, allEvents: [] };
const grid = document.querySelector('#event-grid');
const search = document.querySelector('#search');
const dialog = document.querySelector('#event-dialog');

const dateFormat = new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', weekday: 'short' });
const timeFormat = new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false });

function eventTime(event) {
  const start = event.starts_at || event.start;
  const end = event.ends_at || event.end;
  return `${dateFormat.format(new Date(start))} ${timeFormat.format(new Date(start))}–${timeFormat.format(new Date(end))}`;
}

function status(event) {
  const start = event.starts_at || event.start;
  const end = event.ends_at || event.end;
  if (Date.now() >= new Date(end).getTime()) return '已結束';
  if (Date.now() >= new Date(start).getTime()) return '報名截止';
  const registered = event.registered || 0;
  const capacity = event.capacity || 50;
  return registered >= capacity ? '已額滿' : '開放報名';
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
  
  // 後端資料預設分類處理（若後端沒有 category 欄位，可給予預設值或從 title 判斷）
  const category = event.category || '學術';
  const badge = element('span', 'category-badge', category);
  badge.dataset.category = category;
  
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
  
  const registered = event.registered || 0;
  const capacity = event.capacity || 50;
  bottom.append(element('span', 'seats', `${registered} / ${capacity} 人已報名`), details);
  article.append(top, element('h3', '', event.title), element('p', 'event-description', event.description), meta, bottom);
  return article;
}

// 從後端 API 取得活動資料
async function fetchEventsFromAPI(searchQuery = '') {
  try {
    let url = 'http://localhost:8000/api/events';
    if (searchQuery) {
      url += `?search=${encodeURIComponent(searchQuery)}`;
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error('無法取得活動資料');
    const result = await response.json();
    
    // 將後端回傳的資料存入 state
    state.allEvents = result.data || [];
    render();
  } catch (error) {
    console.error('API 錯誤：', error);
    grid.innerHTML = '<p class="error">無法連線至伺服器，請確認後端是否已啟動。</p>';
  }
}

function render() {
  const query = state.query.toLocaleLowerCase('zh-TW');
  
  // 篩選與排序邏輯
  const matches = state.allEvents.filter(event => {
    const title = event.title || '';
    const description = event.description || '';
    const location = event.location || '';
    const category = event.category || '學術';
    
    const matchesCategory = (state.category === '全部' || category === state.category);
    const matchesQuery = `${title} ${description} ${location}`.toLocaleLowerCase('zh-TW').includes(query);
    
    return matchesCategory && matchesQuery;
  });

  grid.replaceChildren(...matches.slice(0, state.visible).map(card));
  document.querySelector('#result-count').textContent = `共 ${matches.length} 場活動${state.query ? ` · 搜尋「${state.query}」` : ''}`;
  document.querySelector('#empty-state').hidden = matches.length !== 0;
  document.querySelector('#load-more').hidden = state.visible >= matches.length;
  
  document.querySelectorAll('[data-category]').forEach(button => {
    if (button.tagName === 'BUTTON') button.setAttribute('aria-pressed', String(button.dataset.category === state.category));
  });
}

function readUrl() {
  const params = new URLSearchParams(window.location.search);
  state.query = (params.get('q') || '').trim();
  state.category = ['學術', '社團', '體育', '其他'].includes(params.get('category')) ? params.get('category') : '全部';
  state.visible = 6;
  search.value = state.query;
  fetchEventsFromAPI(state.query);
}

function showEvent(event) {
  const category = event.category || '學術';
  document.querySelector('#dialog-category').textContent = `${category} / ${status(event)}`;
  document.querySelector('#dialog-title').textContent = event.title;
  
  const start = event.starts_at || event.start;
  const end = event.ends_at || event.end;
  const registered = event.registered || 0;
  const capacity = event.capacity || 50;

  const info = element('dl');
  for (const [label, value] of [
    ['日期時間', `${new Date(start).getFullYear()} / ${eventTime(event)}`], 
    ['活動地點', event.location], 
    ['主辦單位', event.organizer || '校園主辦單位'], 
    ['報名人數', `${registered} / ${capacity} 人`]
  ]) {
    info.append(element('dt', '', label), element('dd', '', value));
  }
  
  document.querySelector('#dialog-body').replaceChildren(
    info, 
    element('p', 'dialog-description', event.description), 
    element('p', 'dialog-notice', '請先登入帳號以進行活動報名。')
  );
  dialog.showModal();
}

// 事件監聽綁定
document.querySelector('#search-form').addEventListener('submit', event => {
  event.preventDefault(); 
  state.query = search.value.trim(); 
  state.visible = 6; 
  fetchEventsFromAPI(state.query);
});

search.addEventListener('input', () => {
  if (search.value === '') { 
    state.query = ''; 
    state.visible = 6; 
    fetchEventsFromAPI(); 
  }
});

document.querySelector('#categories').addEventListener('click', event => {
  const button = event.target.closest('button[data-category]');
  if (!button) return;
  state.category = button.dataset.category; 
  state.visible = 6; 
  render();
});

document.querySelector('#clear-filters').addEventListener('click', () => {
  state.category = '全部'; 
  state.query = ''; 
  state.visible = 6; 
  search.value = ''; 
  fetchEventsFromAPI(); 
  search.focus();
});

document.querySelector('#load-more').addEventListener('click', () => {
  const previousCount = grid.children.length;
  state.visible += 6; 
  render();
  grid.children[previousCount]?.querySelector('button').focus();
});

document.querySelector('#close-dialog').addEventListener('click', () => dialog.close());

dialog.addEventListener('click', event => { 
  if (event.target === dialog) { 
    const bounds = dialog.getBoundingClientRect(); 
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close(); 
  } 
});

document.querySelectorAll('[data-account]').forEach(button => button.addEventListener('click', () => {
  document.querySelector('#dialog-category').textContent = '帳號服務';
  document.querySelector('#dialog-title').textContent = '登入與我的報名';
  document.querySelector('#dialog-body').replaceChildren(element('p', 'dialog-description', '登入與報名功能將在後續階段開放。'));
  dialog.showModal();
}));

window.addEventListener('popstate', readUrl);
readUrl();

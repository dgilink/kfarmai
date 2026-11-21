(() => {
  'use strict';
  const query = document.getElementById('policySearch');
  const region = document.getElementById('regionFilter');
  const target = document.getElementById('targetFilter');
  const category = document.getElementById('categoryFilter');
  const cards = [...document.querySelectorAll('#noticeList .policy-result')];
  const buttons = [...document.querySelectorAll('[data-status]')];
  const empty = document.getElementById('policyEmpty');
  const count = document.getElementById('noticeCount');
  const pagination = document.getElementById('policyPagination');
  const announcements = document.getElementById('announcements');
  const title = document.getElementById('announcementsTitle');
  const pageSize = 20;
  const pageWindow = 5;
  let status = 'all';
  let page = 1;
  const nowKst = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString();
  const state = (card, today, time) => {
    if (card.dataset.dateStatus === 'checking' || !card.dataset.end) return 'checking';
    if (today > card.dataset.end ||
      (today === card.dataset.end && card.dataset.endTime && time >= card.dataset.endTime)) return 'closed';
    if (!card.dataset.start) return 'unknown';
    if (today < card.dataset.start) return 'upcoming';
    return 'open';
  };
  function renderPagination(totalPages) {
    pagination.hidden = totalPages < 2;
    if (pagination.hidden) {
      pagination.replaceChildren();
      return;
    }
    const makeButton = (label, accessibleLabel, destination, {disabled = false, current = false} = {}) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.setAttribute('aria-label', accessibleLabel);
      button.setAttribute('aria-controls', 'noticeList');
      button.disabled = disabled;
      if (current) button.setAttribute('aria-current', 'page');
      button.addEventListener('click', () => {
        if (destination === page) return;
        page = destination;
        render();
        title.focus({preventScroll:true});
        announcements.scrollIntoView({block:'start'});
      });
      return button;
    };
    const first = Math.max(1, Math.min(page - Math.floor(pageWindow / 2), totalPages - pageWindow + 1));
    const last = Math.min(totalPages, first + pageWindow - 1);
    const controls = [makeButton('이전', '이전 페이지', page - 1, {disabled:page === 1})];
    for (let number = first; number <= last; number++) {
      controls.push(makeButton(String(number), `${totalPages}페이지 중 ${number}페이지`, number, {current:number === page}));
    }
    controls.push(makeButton('다음', '다음 페이지', page + 1, {disabled:page === totalPages}));
    pagination.replaceChildren(...controls);
  }
  function render() {
    const matches = [];
    const text = query.value.trim().toLocaleLowerCase('ko');
    const now = nowKst();
    const today = now.slice(0, 10);
    const time = now.slice(11, 16);
    for (const card of cards) {
      const current = state(card, today, time);
      card.querySelector('.policy-live-status').textContent = ({
        open:'접수중', upcoming:'접수예정', unknown:'접수중', checking:'날짜 확인 중', closed:'마감'
      })[current];
      card.dataset.state = current;
      const match = (!text || card.dataset.search.includes(text)) &&
        (!region.value || card.dataset.region.split(' ').includes(region.value) || card.dataset.region === '전국') &&
        (!target.value || card.dataset.target.split(' ').includes(target.value)) &&
        (!category.value || card.dataset.category.split(' ').includes(category.value)) &&
        (status === 'all' || status === current || (status === 'open' && current === 'unknown'));
      if (match) matches.push(card);
    }
    const totalPages = Math.ceil(matches.length / pageSize);
    page = Math.min(page, Math.max(1, totalPages));
    const offset = (page - 1) * pageSize;
    const visible = new Set(pagination ? matches.slice(offset, offset + pageSize) : matches);
    for (const card of cards) card.hidden = !visible.has(card);
    const total = matches.length + '건';
    if (count.textContent !== total) count.textContent = total;
    empty.hidden = matches.length !== 0;
    if (pagination) renderPagination(totalPages);
  }
  function renderFirstPage() {
    page = 1;
    render();
  }
  query.addEventListener('input', renderFirstPage);
  for (const select of [region,target,category]) select.addEventListener('change', renderFirstPage);
  document.getElementById('resetButton').addEventListener('click', () => {
    query.value = '';
    for (const select of [region,target,category]) select.value = '';
    status = 'all';
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.status === 'all'));
    renderFirstPage();
  });
  for (const button of buttons) button.addEventListener('click', () => {
    status = button.dataset.status;
    for (const option of buttons) option.setAttribute('aria-pressed', String(option === button));
    renderFirstPage();
  });
  render();
})();

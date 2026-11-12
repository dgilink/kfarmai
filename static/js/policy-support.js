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
  let status = 'all';
  const nowKst = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString();
  const state = (card, today, time) => {
    if (card.dataset.dateStatus === 'checking' || !card.dataset.end) return 'checking';
    if (today > card.dataset.end ||
      (today === card.dataset.end && card.dataset.endTime && time >= card.dataset.endTime)) return 'closed';
    if (!card.dataset.start) return 'unknown';
    if (today < card.dataset.start) return 'upcoming';
    return 'open';
  };
  function render() {
    let visible = 0;
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
      card.hidden = !match;
      if (match) visible++;
    }
    count.textContent = visible + '건';
    empty.hidden = visible !== 0;
  }
  query.addEventListener('input', render);
  for (const select of [region,target,category]) select.addEventListener('change', render);
  document.getElementById('resetButton').addEventListener('click', () => {
    query.value = '';
    for (const select of [region,target,category]) select.value = '';
    status = 'all';
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.status === 'all'));
    render();
  });
  for (const button of buttons) button.addEventListener('click', () => {
    status = button.dataset.status;
    for (const option of buttons) option.setAttribute('aria-pressed', String(option === button));
    render();
  });
  render();
})();

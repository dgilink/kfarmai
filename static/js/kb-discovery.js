(() => {
  'use strict';
  const indexGrid = document.getElementById('kbGrid');
  const homeGrid = document.getElementById('homeKbCards');
  if (!indexGrid && !homeGrid) return;
  const search = document.getElementById('kbSearch');
  const category = document.getElementById('kbCategory');
  const status = document.getElementById('kbStatus');
  const safePath = (value) => {
    try {
      const url = new URL(value, location.origin);
      return (url.origin === location.origin || url.origin === 'https://kfarmai.com') &&
        /^\/kb\/[a-z0-9-]+\.html$/.test(url.pathname) ? url.pathname : null;
    } catch { return null; }
  };
  const card = (item) => {
    const link = document.createElement('a');
    link.className = 'kb-card';
    link.href = item.path;
    const meta = document.createElement('small');
    meta.textContent = `${item.category} · ${item.date} · 공식 출처는 글에서 확인`;
    const title = document.createElement('strong');
    title.textContent = item.title;
    const action = document.createElement('span');
    action.textContent = '내용과 출처 확인 →';
    link.append(meta, title, action);
    return link;
  };
  let items = [];
  function draw() {
    if (indexGrid) {
      const q = search.value.trim().toLocaleLowerCase('ko');
      const matches = items.filter(item =>
        (!category.value || item.category === category.value) &&
        (!q || `${item.title} ${item.category}`.toLocaleLowerCase('ko').includes(q)));
      indexGrid.replaceChildren(...matches.map(card));
      status.textContent = matches.length ? `${matches.length}개 참고자료` :
        '일치하는 글이 없습니다. 검색어를 바꿔보세요.';
    }
    if (homeGrid) homeGrid.replaceChildren(...items.slice(0, 4).map(card));
  }
  fetch('/data/kb-index.json', {cache: 'no-store'})
    .then(response => { if (!response.ok) throw Error('registry'); return response.json(); })
    .then(data => {
      if (!Array.isArray(data.items)) throw Error('registry');
      items = data.items.map(value => ({
        title: String(value.title || ''),
        category: String(value.category || ''),
        date: String(value.date || ''),
        path: safePath(value.path)
      })).filter(item => item.title && item.path && /^\d{4}-\d{2}-\d{2}$/.test(item.date))
        .sort((a, b) => b.date.localeCompare(a.date));
      if (category) {
        for (const name of [...new Set(items.map(item => item.category))].sort()) {
          const option = document.createElement('option');
          option.value = name;
          option.textContent = name;
          category.append(option);
        }
      }
      draw();
    })
    .catch(() => {
      if (status) status.textContent = '목록을 불러오지 못했습니다. 위 공개 글을 바로 확인하거나 잠시 후 다시 시도하세요.';
    });
  if (search) search.addEventListener('input', draw);
  if (category) category.addEventListener('change', draw);
})();

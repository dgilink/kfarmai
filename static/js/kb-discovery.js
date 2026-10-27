(() => {
  'use strict';
  const indexGrid = document.getElementById('kbGrid');
  const homeGrid = document.getElementById('homeKbCards');
  if (!indexGrid && !homeGrid) return;
  if (!indexGrid && homeGrid?.dataset.kbStatic === '1') return;
  const search = document.getElementById('kbSearch');
  const category = document.getElementById('kbCategory');
  const status = document.getElementById('kbStatus');
  // Only approved, already-published KB media may be used for the home lead.
  const homeImages = Object.freeze({
    '/kb/greenhouse-heating-preflight-notes.html': '/static/kb/greenhouse-heating-preflight-notes-hero.webp'
  });
  const listImages = Object.freeze({
    '/kb/autumn-cabbage-october-disease-field-checklist.html': '/static/kb/autumn-cabbage-october-disease-field-checklist-hero.png',
    '/kb/greenhouse-heating-preflight-notes.html': '/static/kb/greenhouse-heating-preflight-notes-hero.webp',
    '/kb/greenhouse-irrigation-precheck.html': '/static/kb/greenhouse-irrigation-precheck-hero.webp',
    '/kb/strawberry-winter-light-humidity-check.html': '/static/kb/strawberry-winter-light-humidity-check-hero.svg'
  });
  const safePath = (value) => {
    try {
      const url = new URL(value, location.origin);
      return (url.origin === location.origin || url.origin === 'https://kfarmai.com') &&
        /^\/kb\/[a-z0-9-]+\.html$/.test(url.pathname) ? url.pathname : null;
    } catch { return null; }
  };
  const card = (item, compactList = false) => {
    const link = document.createElement('a');
    link.className = 'kb-card';
    link.href = item.path;
    const meta = document.createElement('small');
    meta.textContent = compactList ? item.category : `${item.category} · ${item.date} · 공식 출처는 글에서 확인`;
    const title = document.createElement('strong');
    title.textContent = item.title;
    if (compactList) {
      const copy = document.createElement('span');
      copy.className = 'kb-list-copy';
      copy.append(meta, title);
      if (item.image) {
        const image = document.createElement('img');
        image.className = 'kb-list-thumb';
        image.src = item.image;
        image.alt = '';
        image.loading = 'lazy';
        image.decoding = 'async';
        link.append(image);
      } else {
        link.classList.add('is-text-only');
      }
      const arrow = document.createElement('span');
      arrow.className = 'kb-list-arrow';
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = '›';
      link.append(copy, arrow);
      return link;
    }
    const action = document.createElement('span');
    action.textContent = '내용과 출처 확인 →';
    if (homeGrid && item.homeImage) {
      const image = document.createElement('img');
      image.src = item.homeImage;
      image.alt = '';
      image.loading = 'eager';
      image.decoding = 'async';
      const copy = document.createElement('span');
      copy.className = 'v41-kb-copy';
      copy.append(meta, title);
      link.append(image, copy);
    } else {
      link.append(meta, title, action);
    }
    return link;
  };
  let items = [];
  function draw() {
    if (indexGrid) {
      const q = search.value.trim().toLocaleLowerCase('ko');
      const matches = items.filter(item =>
        (!category.value || item.category === category.value) &&
        (!q || `${item.title} ${item.category}`.toLocaleLowerCase('ko').includes(q)));
      indexGrid.replaceChildren(...matches.map(item => card(item, true)));
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
        path: safePath(value.path),
        image: listImages[safePath(value.path)] || '',
        homeImage: homeImages[safePath(value.path)] || ''
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

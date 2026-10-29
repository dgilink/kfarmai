(() => {
  'use strict';
  const indexGrid = document.getElementById('kbGrid');
  const homeGrid = document.getElementById('homeKbCards');
  if (!indexGrid && !homeGrid) return;
  if (!indexGrid && homeGrid?.dataset.kbStatic === '1') return;
  const search = document.getElementById('kbSearch');
  const topics = document.getElementById('kbTopics');
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
    link.dataset.topic = topicKey(item.category);
    const meta = document.createElement('small');
    meta.textContent = compactList ? item.category : `${item.category} · ${item.date}`;
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
        image.loading = 'eager';
        image.fetchPriority = 'high';
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
    action.className = 'kb-list-arrow';
    action.setAttribute('aria-hidden', 'true');
    action.textContent = '›';
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
  let selectedCategory = '';
  let initialIndexDraw = true;
  const topicKey = category => String(category || '').includes('재배노하우') ? '재배노하우' : String(category || '');
  function renderTopics() {
    if (!topics) return;
    const categories = [...new Set(items.map(item => topicKey(item.category)).filter(Boolean))].sort();
    const rows = [['', '전체'], ...categories.map(name => [name, name])];
    topics.replaceChildren(...rows.map(([value, label]) => {
      const button = document.createElement('button');
      button.className = 'kb-topic';
      button.type = 'button';
      button.dataset.category = value;
      button.setAttribute('aria-pressed', String(value === selectedCategory));
      button.textContent = label;
      return button;
    }));
  }
  function draw() {
    if (indexGrid) {
      const q = search?.value.trim().toLocaleLowerCase('ko') || '';
      const matches = items.filter(item =>
        (!selectedCategory || topicKey(item.category) === selectedCategory) &&
        (!q || `${item.title} ${item.category}`.toLocaleLowerCase('ko').includes(q)));
      // The Pages artifact already contains the complete approved list. Keep its
      // first-paint nodes (and in-progress image loads) until a real filter action.
      const keepServerList = initialIndexDraw && indexGrid.dataset.kbStatic === '1' && !q && !selectedCategory;
      if (!keepServerList) indexGrid.replaceChildren(...matches.map(item => card(item, true)));
      initialIndexDraw = false;
      if (status) status.textContent = matches.length ? `${matches.length}개 참고자료` :
        '일치하는 글이 없습니다. 검색어를 바꿔보세요.';
    }
    if (homeGrid) homeGrid.replaceChildren(...items.slice(0, 4).map(item => card(item, true)));
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
      renderTopics();
      draw();
    })
    .catch(() => {
      if (status) status.textContent = '목록을 불러오지 못했습니다. 위 공개 글을 바로 확인하거나 잠시 후 다시 시도하세요.';
    });
  if (search) search.addEventListener('input', draw);
  if (topics) topics.addEventListener('click', event => {
    const button = event.target.closest('.kb-topic');
    if (!button || !topics.contains(button)) return;
    selectedCategory = button.dataset.category || '';
    for (const node of topics.querySelectorAll('.kb-topic')) {
      node.setAttribute('aria-pressed', String((node.dataset.category || '') === selectedCategory));
    }
    if (!items.length && indexGrid) {
      let visible = 0;
      for (const row of indexGrid.querySelectorAll('.kb-card')) {
        const matches = !selectedCategory || topicKey(row.querySelector('small')?.textContent.trim()) === selectedCategory;
        row.hidden = !matches;
        if (matches) visible += 1;
      }
      if (status) status.textContent = `${visible}개 참고자료`;
      return;
    }
    draw();
  });
})();

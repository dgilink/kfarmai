(() => {
  'use strict';
  const indexGrid = document.getElementById('kbGrid');
  const homeGrid = document.getElementById('homeKbCards');
  if (!indexGrid && !homeGrid) return;
  // Capture also covers pre-rendered images, before the static-home fast exit.
  const dropBrokenPhoto = image => {
    const link = image.closest('.kb-card');
    if (!link) return;
    image.remove();
    link.classList.add('is-text-only');
  };
  for (const grid of [indexGrid, homeGrid].filter(Boolean)) {
    grid.addEventListener('error', event => {
      if (event.target.matches?.('img.kb-list-thumb')) dropBrokenPhoto(event.target);
    }, true);
    for (const image of grid.querySelectorAll('img.kb-list-thumb')) {
      if (image.complete && !image.naturalWidth) dropBrokenPhoto(image);
    }
  }
  if (!indexGrid && homeGrid?.dataset.kbStatic === '1') return;
  const search = document.getElementById('kbSearch');
  const topics = document.getElementById('kbTopics');
  const status = document.getElementById('kbStatus');
  const safePhoto = value => typeof value === 'string' &&
    /^\/static\/kb\/(?:thumbnails\/)?[a-z0-9][a-z0-9-]*\.(?:png|jpe?g|webp)$/.test(value) &&
    !/infographic|diagram|checklist-(?:graphic|chart)/i.test(value) ? value : '';
  const safePath = (value) => {
    try {
      const url = new URL(value, location.origin);
      return (url.origin === location.origin || url.origin === 'https://kfarmai.com') &&
        /^\/kb\/[a-z0-9-]+\.html$/.test(url.pathname) ? url.pathname : null;
    } catch { return null; }
  };
  const card = (item, index = 0) => {
    const link = document.createElement('a');
    link.className = 'kb-card';
    link.href = item.path;
    link.dataset.topic = topicKey(item.category);
    const meta = document.createElement('small');
    meta.textContent = `${item.category} · ${item.date}`;
    const title = document.createElement('strong');
    title.textContent = item.title;
    const copy = document.createElement('span');
    copy.className = 'kb-list-copy';
    copy.append(meta, title);
    if (item.image) {
      const image = document.createElement('img');
      image.className = 'kb-list-thumb';
      image.src = item.image;
      image.alt = '';
      image.width = 320;
      image.height = 180;
      image.loading = index < 4 ? 'eager' : 'lazy';
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
      if (!keepServerList) indexGrid.replaceChildren(...matches.map((item, index) => card(item, index)));
      initialIndexDraw = false;
      if (status) status.textContent = matches.length ? `${matches.length}개 참고자료` :
        '일치하는 글이 없습니다. 검색어를 바꿔보세요.';
    }
    if (homeGrid) homeGrid.replaceChildren(...items.slice(0, 4).map((item, index) => card(item, index)));
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
        image: safePhoto(value.image)
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

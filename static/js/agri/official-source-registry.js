(function () {
  'use strict';

  const roots = Array.from(document.querySelectorAll('[data-official-source-ids]'));
  if (!roots.length) return;

  function addText(parent, tagName, text, className) {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    node.textContent = text;
    parent.appendChild(node);
    return node;
  }

  function renderSource(list, source) {
    const item = document.createElement('li');
    item.className = 'source-card';
    addText(item, 'strong', source.institution);
    addText(item, 'span', source.title);

    const link = document.createElement('a');
    link.href = source.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = '공식 원문 보기 ↗';
    link.setAttribute('aria-label', source.institution + ' ' + source.title + ' 공식 원문 새 창에서 보기');
    item.appendChild(link);

    const dates = [];
    if (source.publishedAt) dates.push('발표일 ' + source.publishedAt);
    if (source.updatedAt) dates.push('갱신일 ' + source.updatedAt);
    dates.push('kFarmAI 확인일 ' + source.checkedAt);
    if (source.license && source.license.status === 'needs-review') dates.push('이용조건 검토 필요');
    addText(item, 'p', dates.join(' · '), 'source-meta');
    list.appendChild(item);
  }

  fetch('/data/agri-official-sources.json', { headers: { Accept: 'application/json' } })
    .then(function (response) {
      if (!response.ok) throw new Error('source_registry_unavailable');
      return response.json();
    })
    .then(function (registry) {
      const byId = new Map((registry.sources || []).map(function (source) { return [source.id, source]; }));
      roots.forEach(function (root) {
        const ids = String(root.dataset.officialSourceIds || '').split(',').map(function (value) { return value.trim(); }).filter(Boolean);
        const status = root.querySelector('.source-status');
        const list = root.querySelector('.source-list');
        if (!list) return;
        list.replaceChildren();
        ids.forEach(function (id) {
          const source = byId.get(id);
          if (source) renderSource(list, source);
        });
        if (status) status.textContent = list.children.length
          ? '공식자료 ' + list.children.length + '건 · 원문과 이용조건을 함께 확인하세요.'
          : '연결된 공식자료를 확인할 수 없습니다.';
      });
    })
    .catch(function () {
      roots.forEach(function (root) {
        const status = root.querySelector('.source-status');
        if (status) status.textContent = '공식자료 목록을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.';
      });
    });
})();

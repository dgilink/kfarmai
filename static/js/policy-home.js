(() => {
  'use strict';
  const root = document.getElementById('homePolicyFeed');
  if (!root) return;

  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const text = (tag, className, value) => {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = String(value || '');
    return node;
  };
  const status = item => {
    if (item.applicationDateStatus === 'checking') return ['날짜 확인 중', 'checking'];
    if (today > item.applicationEnd) return ['마감', 'closed'];
    if (!item.applicationStart) return ['접수중', 'unknown'];
    if (today < item.applicationStart) return ['접수예정', 'upcoming'];
    return ['접수중', 'open'];
  };
  const safe = item => item && item.reviewStatus === 'approved' &&
    /^[a-z0-9-]+$/.test(item.slug) && (item.applicationDateStatus === 'checking' ?
      item.applicationEnd === null && typeof item.dateCheckReason === 'string' && item.dateCheckReason.trim() :
      /^\d{4}-\d{2}-\d{2}$/.test(item.applicationEnd)) &&
    typeof item.title === 'string' && item.title && /^\d{4}-\d{2}-\d{2}$/.test(item.publishedAt) && Array.isArray(item.region) &&
    Array.isArray(item.categories);

  fetch('/data/policy-support-notices.json', { cache: 'no-store' })
    .then(response => {
      if (!response.ok) throw Error('policy feed unavailable');
      return response.json();
    })
    .then(publication => {
      if (publication.schemaVersion !== 1 || !Array.isArray(publication.items)) return;
      const items = publication.items.filter(safe).filter(item => item.applicationDateStatus === 'checking' || item.applicationEnd >= today)
        .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) ||
          (a.applicationEnd || '9999-12-31').localeCompare(b.applicationEnd || '9999-12-31'))
        .slice(0, 3);
      if (!items.length) return;
      const fragment = document.createDocumentFragment();
      for (const item of items) {
        const [label, state] = status(item);
        const link = text('a', 'home-policy-item', '');
        link.href = `/policy/${item.slug}.html`;
        link.dataset.state = state;
        const meta = text('span', 'home-policy-meta', '');
        meta.append(text('span', 'home-policy-region', item.region.join(' · ')),
          text('span', 'home-policy-category', item.categories.join(' · ')),
          text('span', 'home-policy-date', item.publishedAt),
          text('span', 'home-policy-status', label));
        link.append(meta, text('strong', 'home-policy-title', item.title),
          text('span', 'home-policy-foot', item.applicationDateStatus === 'checking' ?
            item.agency || '공식 공고' : `${item.applicationEnd.replaceAll('-', '.')}까지 · ${item.agency || '공식 공고'}`),
          text('span', 'home-policy-arrow', '›'));
        fragment.append(link);
      }
      root.replaceChildren(fragment);
    })
    .catch(() => {}); // Keep the direct listing link when the feed cannot be loaded.
})();

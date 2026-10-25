(() => {
  'use strict';
  const page = location.pathname;
  if (/^\/kb\/[a-z0-9-]+\.html$/.test(page)) {
    document.body.classList.add('v4-page', 'v4-kb-article');
  }
  const active = page === '/' || page.endsWith('/index.html') && !page.startsWith('/kb/')
    ? 'home' : page.endsWith('/channel.html') || page.endsWith('/post.html')
      ? 'community' : page.startsWith('/kb/') || page.endsWith('/agri-info.html')
        ? 'knowledge' : '';
  const items = [
    ['home', '홈', '/index.html'],
    ['community', '소통', '/channel.html'],
    ['knowledge', '농업정보', '/kb/index.html'],
  ];
  const icons = {
    home: '<path d="m3 11 9-8 9 8v9H3zM9 20v-6h6v6"/>',
    community: '<path d="M4 4h16v12H9l-5 4z"/>',
    knowledge: '<path d="M3 4h8a3 3 0 0 1 3 3v13a3 3 0 0 0-3-3H3zM21 4h-4a3 3 0 0 0-3 3v13a3 3 0 0 1 3-3h4z"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  };
  const icon = key => `<svg class="v4-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[key]}</svg>`;
  const nav = document.createElement('nav');
  nav.className = 'v4-nav';
  nav.setAttribute('aria-label', '주요 메뉴');
  for (const [key, label, href] of items) {
    const link = document.createElement('a');
    link.href = href;
    link.innerHTML = `${icon(key)}<span>${label}</span>`;
    if (key === active) link.setAttribute('aria-current', 'page');
    nav.append(link);
  }
  const menuButton = document.createElement('button');
  menuButton.type = 'button';
  menuButton.innerHTML = `${icon('menu')}<span>전체</span>`;
  menuButton.setAttribute('aria-controls', 'v4AllMenu');
  menuButton.setAttribute('aria-expanded', 'false');
  const menu = document.createElement('div');
  menu.id = 'v4AllMenu';
  menu.className = 'v4-menu';
  menu.hidden = true;
  menu.setAttribute('role', 'dialog');
  menu.setAttribute('aria-modal', 'true');
  menu.setAttribute('aria-labelledby', 'v4MenuTitle');
  const groups = [
    ['계정 · 내 활동', [['마이페이지', '/index.html?panel=my']]],
    ['질문 · 커뮤니티', [['소통', '/channel.html'], ['글쓰기', '/channel.html?write=1']]],
    ['농업정보', [['농업정보', '/kb/index.html'], ['정책·지원', '/subsidy-calendar.html'], ['공공정보 확인', '/agri-info.html']]],
    ['AI 참고 · 실용 도구', [
      ['AI 참고 진단', '/diagnosis.html'], ['농업날씨', '/agri-weather.html'],
      ['농산물 시세', '/market-prices.html'], ['주변 농약사', '/agri_map.html'],
      ['재배달력', '/crop-calendar.html'],
    ]],
    ['설정 · 도움말', [['언어 설정', '/index.html?panel=my'], ['개인정보처리방침', '/oauth/privacy/']]],
  ];
  menu.innerHTML = '<h2 id="v4MenuTitle">전체</h2><div class="v4-menu-groups">' +
    groups.map(([heading, links]) => `<section><h3>${heading}</h3><ul>${links.map(([label, href]) =>
      `<li><a href="${href}">${label}<span aria-hidden="true">→</span></a></li>`).join('')}</ul></section>`).join('') + '</div>';
  function closeMenu() {
    menu.hidden = true;
    menuButton.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }
  menuButton.addEventListener('click', () => {
    const opening = menu.hidden;
    menu.hidden = !opening;
    menuButton.setAttribute('aria-expanded', String(opening));
    document.body.style.overflow = opening ? 'hidden' : '';
    if (opening) menu.querySelector('a')?.focus();
  });
  menu.addEventListener('keydown', event => {
    if (event.key === 'Escape') { closeMenu(); menuButton.focus(); }
    if (event.key === 'Tab') {
      const links = [...menu.querySelectorAll('a')];
      const first = links[0], last = links[links.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  nav.append(menuButton);
  document.body.append(menu, nav);
  if (new URLSearchParams(location.search).get('panel') === 'my') {
    window.addEventListener('load', () => {
      if (typeof window.safeOpenMyPanel === 'function') window.safeOpenMyPanel();
    }, {once: true});
  }
})();

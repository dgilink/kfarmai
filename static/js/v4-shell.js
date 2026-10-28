(() => {
  'use strict';
  if (document.querySelector('[data-v4-shell-nav]')) return;
  const page = location.pathname;
  if (/^\/kb\/[a-z0-9-]+\.html$/.test(page)) {
    document.body.classList.add('v4-page', 'v4-kb-article');
  }
  const toolPages = new Set([
    '/agri-weather.html', '/market-prices.html', '/crop-calendar.html', '/crop-guide.html',
    '/subsidy-calendar.html', '/diagnosis.html', '/diagnosis-cases.html', '/public-data.html',
    '/agri_map.html', '/mfg.html', '/news_sub.html', '/links.html', '/oauth/privacy/',
  ]);
  const active = page === '/' || page.endsWith('/index.html') && !page.startsWith('/kb/')
    ? 'home' : page.endsWith('/channel.html') || page.endsWith('/post.html')
      ? 'community' : page.startsWith('/kb/') || page.endsWith('/agri-info.html')
        ? 'knowledge' : toolPages.has(page) ? 'tools' : '';
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
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    account: '<circle cx="12" cy="8" r="3.5"/><path d="M4.5 20c.7-4 3.1-6 7.5-6s6.8 2 7.5 6"/>',
  };
  const icon = key => `<svg class="v4-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[key]}</svg>`;
  const isHome = active === 'home';
  const legacyHeaders = [...document.querySelectorAll([
    'body > header:not(.hero):not(.print-report-head)', 'body > .app > header:not(.hero)', 'body > .phone > header',
    'body > .wrap > header', 'body > .container > header'
  ].join(','))];
  let globalHeader = document.querySelector('[data-v4-global-header]');
  if (!globalHeader) {
    globalHeader = document.createElement('header');
    globalHeader.className = 'v4-global-header';
    globalHeader.dataset.v4GlobalHeader = '';
    const globalTop = document.createElement('div');
    globalTop.className = 'v4-global-header-inner';
    globalTop.innerHTML = '<a class="v4-global-brand" href="/index.html" aria-label="kFarmAI 홈">kFarmAI</a>' +
      '<nav class="v4-global-actions" aria-label="빠른 메뉴">' +
      (isHome ? '' : '<a class="v4-global-action v4-global-search-action" href="/index.html?focus=search" aria-label="검색">' + icon('search') + '</a>') +
      '<a class="v4-global-action" href="/index.html?panel=my" aria-label="계정">' + icon('account') + '</a></nav>';
    globalHeader.append(globalTop);
    document.body.prepend(globalHeader);
  }
  const homeSearch = isHome ? document.getElementById('searchBox') : null;
  if (homeSearch) {
    homeSearch.classList.add('v4-global-search');
    globalHeader.append(homeSearch);
  }
  document.body.classList.add('v4-global-header-ready');
  if (isHome) document.body.classList.add('v4-global-home');
  for (const header of legacyHeaders) {
    if (header !== globalHeader && !header.contains(homeSearch)) header.classList.add('v4-legacy-header');
  }
  document.querySelectorAll('.hero > .topbar, header img[src*="kfarmai-logo"], .brand img[src*="kfarmai-logo"], .logo img[src*="kfarmai-logo"]').forEach(node => {
    if (node.matches('.topbar')) node.classList.add('v4-legacy-header');
    else node.remove();
  });
  if (isHome && new URLSearchParams(location.search).get('focus') === 'search') {
    requestAnimationFrame(() => {
      const input = document.getElementById('globalSearch');
      input?.focus({preventScroll:true});
      input?.select?.();
    });
  }
  const nav = document.createElement('nav');
  nav.className = 'v4-nav';
  nav.dataset.v4ShellNav = '';
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
  if (active === 'tools') menuButton.setAttribute('aria-current', 'page');
  const menu = document.createElement('div');
  menu.id = 'v4AllMenu';
  menu.className = 'v4-menu';
  menu.hidden = true;
  menu.setAttribute('role', 'dialog');
  menu.setAttribute('aria-modal', 'true');
  menu.setAttribute('aria-labelledby', 'v4MenuTitle');
  let bodyOverflowBeforeMenu = null;
  let scrollPositionBeforeMenu = null;
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
      `<li><a href="${href}"><span class="v4-menu-label">${label}</span><span class="v4-menu-arrow" aria-hidden="true">→</span></a></li>`).join('')}</ul></section>`).join('') + '</div>';
  function setMenuState(open) {
    menu.hidden = !open;
    menuButton.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('is-menu-open', open);
    document.body.classList.toggle('v4-menu-open', open);
  }
  function lockMenuScroll() {
    if (bodyOverflowBeforeMenu !== null) return;
    bodyOverflowBeforeMenu = {
      value: document.body.style.getPropertyValue('overflow'),
      priority: document.body.style.getPropertyPriority('overflow'),
    };
    scrollPositionBeforeMenu = { x: window.scrollX, y: window.scrollY };
    document.body.style.setProperty('overflow', 'hidden', 'important');
  }
  function unlockMenuScroll() {
    if (bodyOverflowBeforeMenu === null) return;
    const previous = bodyOverflowBeforeMenu;
    bodyOverflowBeforeMenu = null;
    if (previous.value) document.body.style.setProperty('overflow', previous.value, previous.priority);
    else document.body.style.removeProperty('overflow');
    if (scrollPositionBeforeMenu) window.scrollTo(scrollPositionBeforeMenu.x, scrollPositionBeforeMenu.y);
    scrollPositionBeforeMenu = null;
  }
  function closeMenu() {
    if (menu.hidden && bodyOverflowBeforeMenu === null) {
      setMenuState(false);
      return;
    }
    setMenuState(false);
    unlockMenuScroll();
  }
  function openMenu({ focus = true } = {}) {
    if (!menu.hidden) return;
    setMenuState(true);
    lockMenuScroll();
    if (focus) menu.querySelector('a')?.focus();
  }
  menuButton.addEventListener('click', () => {
    const opening = menu.hidden;
    if (opening) openMenu();
    else closeMenu();
  });
  menu.addEventListener('click', event => {
    if (event.target.closest('a')) closeMenu();
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
  window.addEventListener('pagehide', closeMenu);
  window.addEventListener('pageshow', closeMenu);
  window.addEventListener('popstate', closeMenu);
  nav.append(menuButton);
  document.body.append(menu, nav);
  const warmTargets = ['/index.html', '/channel.html', '/kb/index.html'];
  const warmNavigation = () => {
    if (navigator.connection?.saveData) return;
    for (const href of warmTargets) {
      if (location.pathname === href || location.pathname === '/' && href === '/index.html') continue;
      if (document.head.querySelector(`link[rel="prefetch"][href="${href}"]`)) continue;
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = href;
      link.as = 'document';
      document.head.append(link);
    }
  };
  if ('requestIdleCallback' in window) requestIdleCallback(warmNavigation, {timeout:1200});
  else window.setTimeout(warmNavigation, 350);

  const tabIndex = { home: 0, community: 1, knowledge: 2 }[active];
  const swipeIgnoreSelector = [
    'input', 'textarea', 'select', 'button', 'label', '[contenteditable="true"]',
    '[role="button"]', '[role="slider"]', '.modal', '.my-panel', '.search-dd',
    '.image-preview-row', '.my-post-edit-images', '.agri-video-strip',
    '.agri-research-chips', '.tools-card', '.topic-chip-row', '.tag-chip-row',
    '.post-images', '.gallery', '.map', '[data-no-main-swipe]'
  ].join(',');
  const openBlockingLayer = () => !!document.querySelector(
    '.modal-overlay.open, .my-panel-overlay.open, .search-dd.open, [data-dropdown-open="true"]'
  );
  const hasTextSelection = () => {
    const selection = window.getSelection?.();
    return !!selection && !selection.isCollapsed && String(selection).trim().length > 0;
  };
  const insideHorizontalScroller = target => {
    for (let node = target; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (node.scrollWidth > node.clientWidth + 2 && /auto|scroll/.test(style.overflowX)) return true;
    }
    return false;
  };
  const shouldIgnoreSwipe = target => {
    if (!menu.hidden && target.closest?.('#v4AllMenu')) return false;
    return openBlockingLayer() || hasTextSelection() || !!target.closest?.(swipeIgnoreSelector)
      || insideHorizontalScroller(target);
  };
  const insidePrimarySwipeSurface = target => innerWidth <= 767
    && (Number.isInteger(tabIndex) || !menu.hidden)
    && (menu.hidden ? document.body.contains(target) : !!target.closest?.('#v4AllMenu'));
  const navigateTo = path => {
    if (location.pathname !== path) location.assign(path);
  };
  const movePrimaryTab = direction => {
    const currentIndex = menu.hidden ? tabIndex : 3;
    if (!Number.isInteger(currentIndex)) return false;
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex > 3) return false;
    if (nextIndex === 3) {
      openMenu({ focus: false });
      return true;
    }
    if (!menu.hidden) closeMenu();
    navigateTo(items[nextIndex][2]);
    return true;
  };
  let swipeStartX = 0;
  let swipeStartY = 0;
  let swipeDeltaX = 0;
  let swipeDeltaY = 0;
  let swipeTouchId = null;
  let swipeTracking = false;
  let swipeTransitioning = false;
  let suppressClickUntil = 0;
  const resetSwipe = () => {
    swipeTracking = false;
    swipeTouchId = null;
    swipeDeltaX = 0;
    swipeDeltaY = 0;
  };
  document.addEventListener('touchstart', event => {
    const touch = event.touches[0];
    if (swipeTransitioning || event.touches.length !== 1 || !touch
        || touch.clientX <= 28 || touch.clientX >= innerWidth - 28
        || !insidePrimarySwipeSurface(event.target)
        || shouldIgnoreSwipe(event.target)) {
      resetSwipe();
      return;
    }
    swipeStartX = touch.clientX;
    swipeStartY = touch.clientY;
    swipeTouchId = touch.identifier;
    swipeDeltaX = 0;
    swipeDeltaY = 0;
    swipeTracking = true;
  }, { passive: true, capture: true });
  document.addEventListener('touchmove', event => {
    if (!swipeTracking) return;
    if (event.touches.length !== 1) { resetSwipe(); return; }
    if (event.touches[0].identifier !== swipeTouchId) { resetSwipe(); return; }
    swipeDeltaX = event.touches[0].clientX - swipeStartX;
    swipeDeltaY = event.touches[0].clientY - swipeStartY;
  }, { passive: true, capture: true });
  document.addEventListener('touchend', event => {
    if (!swipeTracking) return;
    if (event.touches.length) { resetSwipe(); return; }
    const touch = [...event.changedTouches].find(item => item.identifier === swipeTouchId);
    if (!touch) { resetSwipe(); return; }
    swipeDeltaX = touch.clientX - swipeStartX;
    swipeDeltaY = touch.clientY - swipeStartY;
    const absX = Math.abs(swipeDeltaX);
    const absY = Math.abs(swipeDeltaY);
    const direction = swipeDeltaX < 0 ? 1 : -1;
    const shouldMove = absX >= 64 && absX >= absY * 1.35;
    resetSwipe();
    if (!shouldMove) return;
    suppressClickUntil = performance.now() + 700;
    if (!movePrimaryTab(direction)) return;
    swipeTransitioning = true;
    window.setTimeout(() => { swipeTransitioning = false; }, 250);
  }, { passive: true, capture: true });
  document.addEventListener('touchcancel', resetSwipe, { passive: true, capture: true });
  window.addEventListener('pagehide', resetSwipe);
  window.addEventListener('blur', resetSwipe);
  document.addEventListener('click', event => {
    if (performance.now() >= suppressClickUntil) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { capture: true });

  if (new URLSearchParams(location.search).get('panel') === 'my') {
    window.addEventListener('load', () => {
      if (typeof window.safeOpenMyPanel === 'function') window.safeOpenMyPanel();
    }, {once: true});
  }
})();

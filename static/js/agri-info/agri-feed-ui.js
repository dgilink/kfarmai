(function (global) {
  'use strict';

  const STATUS = Object.freeze({
    LIVE: { label: '최신 자료', order: 1 },
    STALE: { label: '최신 갱신 지연', order: 2 },
    FALLBACK: { label: '이전 기준 자료', order: 3 },
    UNAVAILABLE: { label: '현재 자료 확인 불가', order: 4 }
  });

  const DETAIL_SECTIONS = Object.freeze([
    { id: 'weather', title: '날씨·재해', description: '지역별 예보와 농작업 확인 경로', keys: ['weather'], providers: ['kma'], href: 'agri-weather.html' },
    { id: 'pest-safety', title: '병해충·농약안전', description: '병해충 정보와 안전사용기준 확인', keys: ['pestDisease', 'pesticideSafety'], providers: ['ncpms', 'psis'], href: 'public-data.html' },
    { id: 'market', title: '농산물 시세', description: '공표일이 확인되는 시장 흐름 참고자료', keys: ['market'], providers: ['kamis', 'auction'], href: 'market-prices.html' },
    { id: 'cultivation', title: '재배·기술', description: '공식 재배기술과 생산통계 참고자료', keys: ['cultivation'], providers: ['nongsaro', 'mafra'], href: 'crop-guide.html' }
  ]);

  const SUPPORT_LINKS = Object.freeze([
    { title: '지원사업 일정', summary: '신청 전 지자체와 담당기관의 공식 공고를 확인합니다.', href: 'subsidy-calendar.html' },
    { title: '농업 이슈·공고', summary: '발행일과 원문이 확인되는 자료를 살펴봅니다.', href: 'agri-news.html' },
    { title: '공식 농업기관', summary: '농사로와 관련 공공기관 확인 경로를 모았습니다.', href: 'links.html' }
  ]);

  let feedPromise;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function statusInfo(status) {
    return STATUS[status] || STATUS.UNAVAILABLE;
  }

  function statusBadge(status) {
    const badge = element('span', 'agri-status', statusInfo(status).label);
    badge.dataset.status = STATUS[status] ? status : 'UNAVAILABLE';
    return badge;
  }

  function cleanStatus(value) {
    return STATUS[value] ? value : 'UNAVAILABLE';
  }

  function displayDate(value, includeTime) {
    const text = String(value || '').trim();
    if (!text) return '확인 필요';
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return text.slice(0, 16);
    const options = includeTime
      ? { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }
      : { year: 'numeric', month: '2-digit', day: '2-digit' };
    return new Intl.DateTimeFormat('ko-KR', options).format(date);
  }

  function safeUrl(value, fallback) {
    try {
      const url = new URL(String(value || ''), global.location?.href || 'https://kfarmai.com/');
      if (!['http:', 'https:'].includes(url.protocol)) return fallback || '';
      return url.href;
    } catch (_) {
      return fallback || '';
    }
  }

  function itemStatus(item) {
    return cleanStatus(item?.status);
  }

  function freshnessWarning(item) {
    const status = itemStatus(item);
    const date = item?.dataDate || item?.publishedAt;
    if (status === 'FALLBACK') {
      return date
        ? `현재 최신 데이터를 불러오지 못했습니다. ${displayDate(date)} 기준 저장자료를 표시합니다.`
        : '현재 최신 데이터를 불러오지 못했습니다. 공식 제공처를 확인해주세요.';
    }
    if (status === 'STALE') return `${displayDate(date)} 기준 자료입니다. 최신 갱신 여부를 공식 제공처에서 확인해주세요.`;
    if (status === 'UNAVAILABLE') return '현재 자료를 확인할 수 없습니다. 공식 제공처 또는 상세 화면을 확인해주세요.';
    return '';
  }

  function createMeta(item, compact) {
    const meta = element('div', compact ? 'agri-summary-meta' : 'agri-card-meta');
    const basis = item?.dataDate || item?.publishedAt;
    meta.append(
      element('span', '', `자료 기준: ${displayDate(basis)}`),
      element('span', '', `출처: ${item?.source || item?.provider || '공식 제공처'}`)
    );
    if (!compact) meta.append(element('span', '', `마지막 확인: ${displayDate(item?.fetchedAt, true)}`));
    return meta;
  }

  function createSummaryCard(item, detailHref) {
    const card = element('article', 'agri-summary-card');
    card.append(statusBadge(itemStatus(item)));
    card.append(element('h3', '', item?.title || '공식정보 확인'));
    card.append(element('p', '', item?.summary || freshnessWarning(item)));
    card.append(createMeta(item, true));
    if (detailHref) {
      const link = element('a', 'agri-section-link', '확인하기');
      link.href = detailHref;
      link.setAttribute('aria-label', `${item?.title || '농업정보'} 확인하기`);
      card.append(link);
    }
    return card;
  }

  function createDataCard(item, detailHref) {
    const card = element('article', 'agri-data-card');
    card.append(statusBadge(itemStatus(item)));
    card.append(element('h3', '', item?.title || '공식정보 확인'));
    card.append(element('p', '', item?.summary || '공식 제공처에서 자료를 확인해주세요.'));
    const warning = freshnessWarning(item);
    if (warning) card.append(element('div', 'agri-card-warning', warning));
    card.append(createMeta(item, false));

    const actions = element('div', 'agri-card-actions');
    if (detailHref) {
      const detail = element('a', '', '상세 화면');
      detail.href = detailHref;
      actions.append(detail);
    }
    const sourceUrl = safeUrl(item?.sourceUrl);
    if (sourceUrl) {
      const source = element('a', '', '공식 출처');
      source.href = sourceUrl;
      source.target = '_blank';
      source.rel = 'noopener noreferrer';
      actions.append(source);
    }
    if (actions.childElementCount) card.append(actions);
    return card;
  }

  function sectionItems(feed, keys) {
    return keys.flatMap(key => Array.isArray(feed?.sections?.[key]) ? feed.sections[key] : []);
  }

  function providerState(feed, providerKeys) {
    const providers = providerKeys.map(key => feed?.providers?.[key]).filter(Boolean);
    if (!providers.length) return 'UNAVAILABLE';
    return providers.map(provider => cleanStatus(provider.status)).sort((a, b) => statusInfo(a).order - statusInfo(b).order)[0];
  }

  function placeholderItem(feed, config) {
    const providers = config.providers.map(key => feed?.providers?.[key]).filter(Boolean);
    const best = providers.sort((a, b) => statusInfo(cleanStatus(a.status)).order - statusInfo(cleanStatus(b.status)).order)[0];
    const status = best ? cleanStatus(best.status) : 'UNAVAILABLE';
    return {
      title: `${config.title} 확인`,
      summary: best?.notice || `${config.title} 자료를 현재 불러오지 못했습니다.`,
      status,
      dataDate: best?.dataDate || null,
      fetchedAt: best?.fetchedAt || feed?.generatedAt,
      source: best?.source || '공식 제공처',
      sourceUrl: best?.sourceUrl || '',
      isFallback: status === 'FALLBACK'
    };
  }

  function summaryItems(feed) {
    return DETAIL_SECTIONS.map(config => {
      const items = sectionItems(feed, config.keys)
        .filter(item => itemStatus(item) !== 'UNAVAILABLE')
        .sort((a, b) => statusInfo(itemStatus(a)).order - statusInfo(itemStatus(b)).order);
      const freshEnough = items.find(item => {
        const age = Number(item?.freshness?.ageHours);
        return !['FALLBACK', 'STALE'].includes(itemStatus(item)) || !Number.isFinite(age) || age <= 168;
      });
      return { item: freshEnough || items[0] || placeholderItem(feed, config), href: config.href };
    });
  }

  function renderSummary(root, feed, options) {
    if (!root) return;
    const grid = element('div', 'agri-summary-grid');
    const limit = Number(options?.limit) || 4;
    for (const entry of summaryItems(feed).slice(0, limit)) grid.append(createSummaryCard(entry.item, entry.href));
    const more = element('a', 'agri-summary-more', '농업정보 더보기');
    more.href = 'agri-info.html';
    root.replaceChildren(grid, more);
  }

  function sectionHeading(config) {
    const head = element('div', 'agri-v3-section-head');
    const copy = element('div');
    copy.append(element('h2', '', config.title), element('p', '', config.description));
    const link = element('a', 'agri-section-link', '상세 보기');
    link.href = config.href;
    head.append(copy, link);
    return head;
  }

  function renderDashboard(root, feed) {
    if (!root) return;
    const fragment = document.createDocumentFragment();

    const today = element('section', 'agri-v3-section');
    today.id = 'today';
    today.append(sectionHeading({ title: '오늘 확인할 정보', description: '현재 확인 가능한 공식자료를 분야별로 요약합니다.', href: '#weather' }));
    const todayGrid = element('div', 'agri-summary-grid agri-today-grid');
    for (const entry of summaryItems(feed)) todayGrid.append(createSummaryCard(entry.item, entry.href));
    today.append(todayGrid);
    fragment.append(today);

    for (const config of DETAIL_SECTIONS) {
      const section = element('section', 'agri-v3-section');
      section.id = config.id;
      section.append(sectionHeading(config));
      const grid = element('div', 'agri-card-grid');
      const items = sectionItems(feed, config.keys)
        .sort((a, b) => statusInfo(itemStatus(a)).order - statusInfo(itemStatus(b)).order)
        .slice(0, 4);
      if (items.length) items.forEach(item => grid.append(createDataCard(item, config.href)));
      else grid.append(createDataCard(placeholderItem(feed, config), config.href));
      section.append(grid);
      fragment.append(section);
    }

    const support = element('section', 'agri-v3-section');
    support.id = 'support';
    support.append(sectionHeading({ title: '지원·공고', description: '신청과 참여 전 공식 공고를 확인합니다.', href: 'subsidy-calendar.html' }));
    const paths = element('div', 'agri-path-grid');
    for (const item of SUPPORT_LINKS) {
      const link = element('a', 'agri-path-card');
      link.href = item.href;
      link.append(element('strong', '', item.title), element('span', '', item.summary));
      paths.append(link);
    }
    support.append(paths);
    fragment.append(support);
    root.replaceChildren(fragment);
  }

  function updatePageStatus(feed) {
    const loading = document.getElementById('agriFeedLoading');
    const message = document.getElementById('agriFeedMessage');
    const lastCheck = document.getElementById('agriLastCheck');
    if (loading) loading.hidden = true;
    if (lastCheck) lastCheck.textContent = `마지막 확인: ${displayDate(feed?.generatedAt, true)}`;
    if (!message) return;
    const providerStatuses = Object.values(feed?.providers || {}).map(provider => cleanStatus(provider.status));
    const hasUnavailable = providerStatuses.some(status => status === 'UNAVAILABLE');
    if (feed?.partial || hasUnavailable) {
      message.hidden = false;
      message.className = 'agri-feed-message is-partial';
      message.textContent = '일부 제공처 자료를 불러오지 못했습니다. 확인 가능한 공식자료와 기준일만 표시합니다.';
    } else {
      message.hidden = true;
      message.textContent = '';
    }
  }

  function feedEndpoint() {
    const base = String(global.KFARMAI_AGRI_API_BASE || global.location?.origin || '').trim();
    return new URL('/api/agri-feed', base || 'https://kfarmai.com').toString();
  }

  async function fetchFeed() {
    const controller = new AbortController();
    const timeout = global.setTimeout(() => controller.abort(), 15000);
    try {
      const response = await global.fetch(feedEndpoint(), { headers: { Accept: 'application/json' }, cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('agri_feed_http');
      const feed = await response.json();
      if (!feed || !feed.sections || !feed.providers || !feed.generatedAt) throw new Error('agri_feed_contract');
      return feed;
    } finally {
      global.clearTimeout(timeout);
    }
  }

  async function emergencyFeed() {
    const generatedAt = new Date().toISOString();
    const [weather, market] = await Promise.all([
      readJson('data/agri_weather.json'),
      readJson('data/market_prices.json')
    ]);
    const weatherDate = weather?.dataDate || weather?.updatedAt || null;
    const marketDate = market?.sourceDate || market?.updatedAt || null;
    const weatherItem = weatherDate ? emergencyItem('KMA', 'weather', '저장 날씨 참고', weather?.notice, weatherDate, generatedAt, 'https://www.weather.go.kr/') : null;
    const marketItems = (market?.items || []).slice(0, 2).map(item => emergencyItem(
      'KAMIS', 'market', `${item.item || '농산물'} 저장 시세`, item.memo || market.notice, item.date || marketDate, generatedAt, 'https://www.kamis.or.kr/'
    ));
    return {
      generatedAt,
      overallStatus: weatherItem || marketItems.length ? 'FALLBACK' : 'UNAVAILABLE',
      partial: true,
      sections: {
        weather: weatherItem ? [weatherItem] : [],
        pestDisease: [],
        pesticideSafety: [],
        market: marketItems,
        cultivation: [],
        support: []
      },
      providers: {
        kma: emergencyProvider('KMA', 'weather', weatherDate, generatedAt, Boolean(weatherItem), 'https://www.weather.go.kr/'),
        kamis: emergencyProvider('KAMIS', 'market', marketDate, generatedAt, Boolean(marketItems.length), 'https://www.kamis.or.kr/'),
        ncpms: emergencyProvider('NCPMS', 'pestDisease', null, generatedAt, false, 'https://ncpms.rda.go.kr/'),
        psis: emergencyProvider('PSIS', 'pesticideSafety', null, generatedAt, false, 'https://psis.rda.go.kr/'),
        nongsaro: emergencyProvider('NONGSARO', 'cultivation', null, generatedAt, false, 'https://www.nongsaro.go.kr/'),
        mafra: emergencyProvider('MAFRA', 'cultivation', null, generatedAt, false, 'https://data.mafra.go.kr/'),
        auction: emergencyProvider('AUCTION', 'market', null, generatedAt, false, 'https://at.agromarket.kr/')
      }
    };
  }

  function emergencyItem(provider, category, title, summary, dataDate, fetchedAt, sourceUrl) {
    return {
      provider,
      category,
      status: 'FALLBACK',
      title,
      summary: summary || `${dataDate} 기준 저장자료입니다.`,
      dataDate,
      publishedAt: null,
      fetchedAt,
      source: provider,
      sourceUrl,
      freshness: { state: 'STALE', ageHours: null, maxAgeHours: null, checkedAt: fetchedAt },
      isFallback: true,
      errorCode: 'agri_feed_unavailable'
    };
  }

  function emergencyProvider(provider, category, dataDate, fetchedAt, hasFallback, sourceUrl) {
    return {
      provider,
      category,
      status: hasFallback ? 'FALLBACK' : 'UNAVAILABLE',
      title: `${provider} 자료`,
      summary: hasFallback ? `${dataDate} 기준 저장자료입니다.` : '현재 자료를 확인할 수 없습니다.',
      dataDate,
      publishedAt: null,
      fetchedAt,
      source: provider,
      sourceUrl,
      freshness: { state: dataDate ? 'STALE' : 'UNKNOWN', ageHours: null, maxAgeHours: null, checkedAt: fetchedAt },
      isFallback: hasFallback,
      errorCode: 'agri_feed_unavailable',
      notice: hasFallback ? `현재 최신 데이터를 불러오지 못했습니다. ${dataDate} 기준 저장자료를 표시합니다.` : '현재 자료를 확인할 수 없습니다.',
      items: []
    };
  }

  async function readJson(url) {
    try {
      const response = await global.fetch(url, { cache: 'no-store' });
      return response.ok ? response.json() : null;
    } catch (_) {
      return null;
    }
  }

  async function loadFeed() {
    if (!feedPromise) feedPromise = fetchFeed().catch(() => emergencyFeed());
    return feedPromise;
  }

  async function init() {
    const dashboard = document.getElementById('agriFeedDashboard');
    const home = document.getElementById('homeAgriFeed');
    const tab = document.getElementById('agriTabFeed');
    if (!dashboard && !home && !tab) return;
    try {
      const feed = await loadFeed();
      renderDashboard(dashboard, feed);
      renderSummary(home, feed, { limit: 4 });
      renderSummary(tab, feed, { limit: 4 });
      updatePageStatus(feed);
    } catch (_) {
      const loading = document.getElementById('agriFeedLoading');
      const message = document.getElementById('agriFeedMessage');
      if (loading) loading.hidden = true;
      if (message) {
        message.hidden = false;
        message.className = 'agri-feed-message';
        message.textContent = '현재 농업정보를 불러오지 못했습니다. 잠시 후 다시 확인해주세요.';
      }
      for (const root of [dashboard, home, tab].filter(Boolean)) {
        root.replaceChildren(element('div', 'agri-feed-empty', '현재 농업정보를 불러오지 못했습니다.'));
      }
    }
  }

  global.KFAgriFeedUI = Object.freeze({
    STATUS,
    DETAIL_SECTIONS,
    displayDate,
    freshnessWarning,
    renderDashboard,
    renderSummary,
    fetchFeed,
    emergencyFeed,
    init
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})(window);

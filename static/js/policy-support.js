(() => {
  'use strict';

  const filters = {
    regions: ['전국','서울','경기','강원','충북','충남','전북','전남','경북','경남','제주'],
    targets: ['농업인','청년농','농업법인','귀농귀촌','시설재배','스마트팜','홈가드닝'],
    categories: ['스마트팜','시설원예','농기계','친환경','유통·가공','교육','재배기술','농자재']
  };
  const els = {
    query: document.getElementById('policySearch'),
    region: document.getElementById('regionFilter'),
    target: document.getElementById('targetFilter'),
    category: document.getElementById('categoryFilter'),
    reset: document.getElementById('resetButton'),
    programs: document.getElementById('programList'),
    programCount: document.getElementById('countText'),
    notices: document.getElementById('noticeList'),
    noticeCount: document.getElementById('noticeCount'),
    statuses: [...document.querySelectorAll('[data-status]')]
  };
  let programs = [];
  let notices = [];
  let statusFilter = 'all';
  let noticeError = false;
  let typeError = false;

  const list = value => Array.isArray(value) ? value : value ? [value] : [];
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
  const todayKst = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '');
  const officialUrl = value => {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password) return null;
      const host = url.hostname.toLowerCase();
      if (!/\.go\.kr$/.test(host) && !/\.gov\.kr$/.test(host) && host !== 'bojo.go.kr' && host !== 'agrix.go.kr') return null;
      return url.href;
    } catch { return null; }
  };

  function fillSelect(select, label, options) {
    select.replaceChildren(new Option(label, ''), ...options.map(value => new Option(value, value)));
  }

  function matches(item) {
    const query = els.query.value.trim().toLocaleLowerCase('ko');
    const text = [item.title, item.summary, item.agency, ...list(item.category || item.categories),
      ...list(item.target || item.targets)].join(' ').toLocaleLowerCase('ko');
    return (!query || text.includes(query)) &&
      (!els.region.value || list(item.region).includes(els.region.value) || list(item.region).includes('전국')) &&
      (!els.target.value || list(item.target || item.targets).includes(els.target.value)) &&
      (!els.category.value || list(item.category || item.categories).includes(els.category.value));
  }

  function noticeStatus(item, today) {
    if (!validDate(item.applicationStart) || !validDate(item.applicationEnd)) return 'unknown';
    if (today < item.applicationStart) return 'upcoming';
    if (today > item.applicationEnd) return 'closed';
    return 'open';
  }

  function renderNotice(item, today) {
    const state = noticeStatus(item, today);
    const label = { open: '접수중', upcoming: '접수예정', closed: '마감', unknown: '일정 확인' }[state];
    const period = state === 'unknown' ? '공식 공고에서 확인' : `${item.applicationStart} ~ ${item.applicationEnd}`;
    return `<article class="policy-result" data-notice-status="${state}">
      <div class="policy-meta"><span>${escape(label)}</span><span>${escape(list(item.region).join(' · ') || '지역 확인')}</span><span>${escape(item.agency)}</span></div>
      <h3>${escape(item.title)}</h3>
      <p>${escape(item.summary || '')}</p>
      <dl><dt>신청기간</dt><dd>${escape(period)}</dd><dt>대상</dt><dd>${escape(list(item.targets).join(' · ') || '공고 확인')}</dd><dt>확인일</dt><dd>${escape(item.verifiedAt)}</dd></dl>
      <a class="policy-official-link" href="${escape(item.officialUrl)}" target="_blank" rel="noopener noreferrer">공식 공고 보기 ↗</a>
    </article>`;
  }

  function renderProgram(item) {
    return `<article class="policy-result policy-type">
      <div class="policy-meta"><span>사업 유형</span><span>${escape(list(item.category).join(' · '))}</span></div>
      <h3>${escape(item.title)}</h3>
      <p>${escape(item.summary)}</p>
      <dl><dt>대상</dt><dd>${escape(list(item.target).join(' · '))}</dd><dt>지원 범위</dt><dd>${escape(item.supportType)}</dd><dt>공고 시기</dt><dd>${escape(item.period)}</dd></dl>
      ${officialUrl(item.officialUrl) ? `<a class="policy-official-link" href="${escape(officialUrl(item.officialUrl))}" target="_blank" rel="noopener noreferrer">관련 공식 검색처 ↗</a>` : ''}
    </article>`;
  }

  function render() {
    const today = todayKst();
    if (noticeError) {
      els.noticeCount.textContent = '확인 불가';
      els.notices.innerHTML = '<p class="policy-empty">공고 목록을 불러오지 못했습니다. 위 공식 검색처를 이용해 주세요.</p>';
    } else {
      const visible = notices.filter(matches).filter(item => statusFilter === 'all' || noticeStatus(item, today) === statusFilter)
        .sort((a, b) => (a.applicationEnd || '9999').localeCompare(b.applicationEnd || '9999'));
      els.noticeCount.textContent = `${visible.length}건`;
      els.notices.innerHTML = visible.length ? visible.map(item => renderNotice(item, today)).join('') :
        '<p class="policy-empty">조건에 맞는 검증된 공고가 없습니다. 위 공식 검색처에서 최신 공고를 확인하세요.</p>';
    }
    if (typeError) {
      els.programCount.textContent = '확인 불가';
      els.programs.innerHTML = '<p class="policy-empty">사업 유형을 불러오지 못했습니다. 위 공식 검색처를 이용해 주세요.</p>';
    } else {
      const selected = programs.filter(matches);
      els.programCount.textContent = `${selected.length}건`;
      els.programs.innerHTML = selected.length ? selected.map(renderProgram).join('') :
        '<p class="policy-empty">조건에 맞는 사업 유형이 없습니다. 검색어나 필터를 바꿔보세요.</p>';
    }
  }

  async function loadJson(path) {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Data unavailable: ${path}`);
    return response.json();
  }

  async function init() {
    fillSelect(els.region, '전체 지역', filters.regions);
    fillSelect(els.target, '전체 대상', filters.targets);
    fillSelect(els.category, '전체 분야', filters.categories);
    els.query.addEventListener('input', render);
    [els.region, els.target, els.category].forEach(select => select.addEventListener('change', render));
    els.reset.addEventListener('click', () => {
      els.query.value = '';
      [els.region, els.target, els.category].forEach(select => { select.value = ''; });
      statusFilter = 'all';
      els.statuses.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.status === 'all')));
      render();
    });
    els.statuses.forEach(button => button.addEventListener('click', () => {
      statusFilter = button.dataset.status;
      els.statuses.forEach(option => option.setAttribute('aria-pressed', String(option === button)));
      render();
    }));

    const [noticeResult, typeResult] = await Promise.allSettled([
      loadJson('/data/policy-support-notices.json'), loadJson('/data/subsidy_programs.json')
    ]);
    if (noticeResult.status === 'fulfilled' && noticeResult.value?.schemaVersion === 1 && Array.isArray(noticeResult.value.items)) {
      notices = noticeResult.value.items.filter(item => item.reviewStatus === 'approved' &&
        item.externalId && /^[a-f0-9]{64}$/.test(item.sourceHash || '') && item.title && item.agency && validDate(item.verifiedAt) &&
        officialUrl(item.officialUrl)).map(item => ({ ...item, officialUrl: officialUrl(item.officialUrl) }));
    } else {
      noticeError = true;
    }
    if (typeResult.status === 'fulfilled' && Array.isArray(typeResult.value)) programs = typeResult.value;
    else typeError = true;
    render();
  }
  init();
})();

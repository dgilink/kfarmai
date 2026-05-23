const DATA_URLS = ['kfarm_nationwide_subsidy.json', '../kfarm_nationwide_subsidy.json'];
const CATEGORY_FILTERS = ['전체', '진행중', '상토 지원', '비료 지원', '종자 지원', '농약 지원', '농기계 지원', '기타'];

let subsidyData = [];
let activeQuickFilter = '전체';

const state = {
  keyword: '',
  category: '전체'
};

function cleanText(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\\n|\\r|\\t/g, ' ')
    .replace(/[\n\r\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function isClosed(item) {
  const endDate = parseDate(item.end_date);
  if (!endDate) return true;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return endDate < today;
}

function getStatus(item) {
  return isClosed(item) ? '마감' : '진행중';
}

function formatDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? value : '확인 필요';
}

function normalize(value) {
  return cleanText(value).toLowerCase().replace(/\s+/g, '');
}

function getSearchBlob(item) {
  return normalize([
    item.region,
    item.title,
    item.department,
    item.target_audience,
    item.support_detail,
    ...(item.categories || [])
  ].join(' '));
}

function compareSubsidies(a, b) {
  const aClosed = isClosed(a);
  const bClosed = isClosed(b);
  if (aClosed !== bClosed) return aClosed ? 1 : -1;
  const aDate = parseDate(a.end_date) || parseDate(a.post_date) || new Date(0);
  const bDate = parseDate(b.end_date) || parseDate(b.post_date) || new Date(0);
  return bDate - aDate;
}

function filterSubsidies() {
  const keyword = normalize(state.keyword);
  const category = state.category;

  return subsidyData
    .filter(item => {
      const categories = item.categories || [];
      const matchesKeyword = !keyword || getSearchBlob(item).includes(keyword);
      const matchesCategory = category === '전체' || categories.includes(category);
      const matchesQuick = activeQuickFilter === '전체'
        || (activeQuickFilter === '진행중' ? !isClosed(item) : categories.includes(activeQuickFilter));
      return matchesKeyword && matchesCategory && matchesQuick;
    })
    .sort(compareSubsidies);
}

function renderQuickFilters() {
  const wrapper = document.getElementById('subsidyQuickFilters');
  wrapper.innerHTML = CATEGORY_FILTERS.map(filter => `
    <button class="filter-chip${filter === activeQuickFilter ? ' active' : ''}" type="button" data-filter="${filter}">
      ${filter}
    </button>
  `).join('');

  wrapper.querySelectorAll('.filter-chip').forEach(button => {
    button.addEventListener('click', () => {
      activeQuickFilter = button.dataset.filter;
      renderQuickFilters();
      renderSubsidies();
    });
  });
}

function renderSummary(items) {
  const total = subsidyData.length;
  const openCount = subsidyData.filter(item => !isClosed(item)).length;
  document.getElementById('subsidySummary').textContent =
    `전체 ${total.toLocaleString()}건 · 진행중 ${openCount.toLocaleString()}건 · 현재 표시 ${items.length.toLocaleString()}건`;
}

function renderSubsidyItem(item) {
  const closed = isClosed(item);
  const status = getStatus(item);
  const categories = (item.categories || ['기타']).join(' · ');
  const title = cleanText(item.title);
  const detail = cleanText(item.support_detail || item.target_audience);
  const region = cleanText(item.region);
  const department = cleanText(item.department || '담당 부서 확인 필요');
  const url = cleanText(item.original_url);

  return `
    <article class="subsidy-item${closed ? ' closed' : ''}">
      <div class="item-main">
        <div class="item-kicker">
          <span class="status${closed ? '' : ' open'}">${status}</span>
          <span class="item-region">${region}</span>
          <span>${department}</span>
          <span class="category-tag">${categories}</span>
        </div>
        <a class="item-title" href="${url}" target="_blank" rel="noopener noreferrer">${title}</a>
        <p class="item-detail">${detail}</p>
        <div class="item-footer">
          <span>게시일 ${formatDate(item.post_date)}</span>
          <span>신청 ${formatDate(item.start_date)} ~ ${formatDate(item.end_date)}</span>
        </div>
      </div>
      <div class="item-dates">
        <strong>${status}</strong>
        <span>마감일 ${formatDate(item.end_date)}</span>
      </div>
    </article>
  `;
}

function renderSubsidies() {
  const list = document.getElementById('subsidyList');
  const filtered = filterSubsidies();
  renderSummary(filtered);

  if (!filtered.length) {
    list.innerHTML = '<div class="empty-state">조건에 맞는 보조사업 공고가 없습니다. 지역명이나 카테고리를 바꿔보세요.</div>';
    return;
  }

  list.innerHTML = filtered.map(renderSubsidyItem).join('');
}

function bindControls() {
  const input = document.getElementById('subsidySearchInput');
  const select = document.getElementById('subsidyCategorySelect');
  const button = document.getElementById('subsidySearchButton');

  const runSearch = () => {
    state.keyword = input.value;
    state.category = select.value;
    renderSubsidies();
  };

  input.addEventListener('input', runSearch);
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') runSearch();
  });
  select.addEventListener('change', runSearch);
  button.addEventListener('click', runSearch);
}

function validateSubsidyData(data) {
  if (!Array.isArray(data)) return [];
  return data.filter(item => (
    item &&
    cleanText(item.title) &&
    cleanText(item.region) &&
    cleanText(item.original_url)
  ));
}

async function loadSubsidyData() {
  const list = document.getElementById('subsidyList');
  try {
    let response = null;
    let loadedUrl = '';

    for (const url of DATA_URLS) {
      const candidate = await fetch(url, { cache: 'no-store' });
      if (candidate.ok) {
        response = candidate;
        loadedUrl = url;
        break;
      }
    }

    if (!response) throw new Error('No subsidy JSON file found');

    const rawData = await response.json();
    subsidyData = validateSubsidyData(rawData);
    console.info(`Loaded subsidy data from ${loadedUrl}`);
    renderQuickFilters();
    renderSubsidies();
  } catch (error) {
    console.error('Failed to load subsidy data:', error);
    list.innerHTML = `
      <div class="error-state">
        보조사업 데이터를 불러오지 못했습니다. kfarm_nationwide_subsidy.json 파일 위치와 로컬 서버 실행 여부를 확인하세요.
      </div>
    `;
    document.getElementById('subsidySummary').textContent = '데이터 로드 실패';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  bindControls();
  loadSubsidyData();
});

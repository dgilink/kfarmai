(function(){
  const DATA_URL = 'data/agri-info/agri-news-issues.json';
  const CATEGORIES = ['전체','기상·재배','가격·유통','정책·지원사업','스마트농업','병해충·작물보호','농자재·비료','축산','수출·시장','지역농업','기타'];
  let newsIssues = [];
  let activeCategory = '전체';

  function u(){
    return window.KFAgriInfoUtils;
  }

  async function loadAgriIssues(){
    const grid = document.getElementById('agriIssueGrid');
    if(!grid)return;
    try{
      const issues = await fetchActiveIssues();
      grid.innerHTML = issues.length
        ? issues.slice(0, 5).map(issueCardHtml).join('')
        : '<div class="agri-empty">오늘의 농업 이슈는 원문 확인 후 순차적으로 반영 예정입니다.</div>';
    }catch(error){
      console.warn('농업 이슈 데이터를 불러오지 못했습니다.', error?.message);
      grid.innerHTML = '<div class="agri-empty">오늘의 농업 이슈를 불러오지 못했습니다.</div>';
    }
  }

  async function fetchActiveIssues(){
    if(newsIssues.length)return newsIssues;
    const res = await fetch(DATA_URL, { cache: 'no-store' });
    if(!res.ok)throw new Error('news issue data unavailable');
    const items = await res.json();
    newsIssues = (Array.isArray(items) ? items : [])
      .filter(item => item.status === 'active' && item.sourceUrl && item.sourceName && item.publishedAt)
      .sort((a,b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')));
    return newsIssues;
  }

  function issueCardHtml(item){
    const utils = u();
    const tone = issueTone(item.category);
    return `<article class="agri-issue-card ${tone}">
      <span class="agri-badge">${utils.escapeHtml(item.category || '기타')}</span>
      <strong>${utils.escapeHtml(item.issueTitle || item.title)}</strong>
      <div class="agri-issue-meta"><span>${utils.escapeHtml(item.sourceName)} · ${utils.escapeHtml(utils.displayDate(item.publishedAt, '발행일 확인 중'))}</span><a class="agri-source-link" href="${utils.escapeAttr(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">원문</a></div>
    </article>`;
  }

  function issueTone(category){
    const key = String(category || '');
    if(key.includes('기상'))return 'tone-weather';
    if(key.includes('가격') || key.includes('유통') || key.includes('시장'))return 'tone-market';
    if(key.includes('정책') || key.includes('지원'))return 'tone-policy';
    if(key.includes('스마트'))return 'tone-smart';
    if(key.includes('병해충') || key.includes('작물보호'))return 'tone-protection';
    if(key.includes('농자재') || key.includes('비료'))return 'tone-input';
    if(key.includes('축산'))return 'tone-livestock';
    return 'tone-smart';
  }

  async function loadAgriNewsPage(){
    const chips = document.getElementById('agriNewsChips');
    const list = document.getElementById('agriNewsList');
    if(!chips || !list)return;
    try{
      await fetchActiveIssues();
      renderAgriNewsPage();
    }catch(error){
      console.warn('농업 뉴스 이슈 데이터를 불러오지 못했습니다.', error?.message);
      list.innerHTML = '<p class="note">농업 이슈를 불러오지 못했습니다.</p>';
    }
  }

  function renderAgriNewsPage(category = activeCategory){
    activeCategory = category || '전체';
    const chips = document.getElementById('agriNewsChips');
    const list = document.getElementById('agriNewsList');
    if(!chips || !list)return;
    const utils = u();
    chips.innerHTML = CATEGORIES.map(cat => `<button type="button" class="agri-research-chip ${cat === activeCategory ? 'active' : ''}" onclick="KFAgriIssues.renderAgriNewsPage('${utils.escapeAttr(cat)}')">${utils.escapeHtml(cat)}</button>`).join('');
    const rows = newsIssues.filter(item => activeCategory === '전체' || item.category === activeCategory);
    list.innerHTML = rows.length
      ? rows.map(fullIssueCardHtml).join('')
      : '<p class="note">해당 카테고리의 active 이슈가 없습니다.</p>';
  }

  function fullIssueCardHtml(item){
    const utils = u();
    const tags = (item.tags || []).slice(0, 5).map(tag => `<span class="agri-badge">${utils.escapeHtml(tag)}</span>`).join('');
    return `<article class="news-card">
      <div class="agri-badges"><span class="agri-badge">${utils.escapeHtml(item.category || '기타')}</span>${tags}</div>
      <h2>${utils.escapeHtml(item.issueTitle || item.title)}</h2>
      <p class="news-original-title">${utils.escapeHtml(item.title)}</p>
      <div class="news-meta">${utils.escapeHtml(item.sourceName)} · ${utils.escapeHtml(utils.displayDate(item.publishedAt, '발행일 확인 중'))}</div>
      <p class="news-kf-summary">${utils.escapeHtml(item.summaryByKfarmai || '원문 링크에서 자세한 내용을 확인하세요.')}</p>
      <a class="news-source-button" href="${utils.escapeAttr(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">원문 보기</a>
    </article>`;
  }

  window.KFAgriIssues = {
    loadAgriIssues,
    loadAgriNewsPage,
    renderAgriNewsPage
  };
  window.loadAgriIssues = loadAgriIssues;
  window.loadAgriNewsPage = loadAgriNewsPage;
})();

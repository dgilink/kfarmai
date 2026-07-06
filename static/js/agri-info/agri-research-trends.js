(function(){
  const DATA_URL = 'data/agri-info/agri-research-trends.json';
  const CATEGORIES = ['전체','스마트농업','AI·로봇','품종·종자','시설재배','기후변화','병해충·작물보호','토양·비료','수확후관리','농자재·기계','식품·가공'];
  let agriResearchItems = [];
  let agriResearchCategory = '전체';

  function u(){
    return window.KFAgriInfoUtils;
  }

  async function loadAgriResearch(){
    try{
      const res = await fetch(DATA_URL, { cache: 'no-store' });
      if(!res.ok)throw new Error('research data unavailable');
      const items = await res.json();
      agriResearchItems = (Array.isArray(items) ? items : []).filter(item => item.status === 'active');
    }catch(error){
      console.warn('농업 연구동향 데이터를 불러오지 못했습니다.', error?.message);
      agriResearchItems = [];
    }
    renderAgriResearch();
  }

  function renderAgriResearch(category = agriResearchCategory){
    agriResearchCategory = category || '전체';
    const chips = document.getElementById('agriResearchChips');
    const list = document.getElementById('agriResearchList');
    if(!chips || !list)return;

    const utils = u();
    chips.innerHTML = CATEGORIES.map(cat => `<button type="button" class="agri-research-chip ${cat === agriResearchCategory ? 'active' : ''}" onclick="renderAgriResearch('${utils.escapeAttr(cat)}')">${utils.escapeHtml(cat)}</button>`).join('');
    const filtered = agriResearchItems
      .filter(item => agriResearchCategory === '전체' || item.category === agriResearchCategory)
      .slice(0, 5);
    if(!filtered.length){
      list.innerHTML = '<div class="agri-empty">검수 완료된 연구동향은 순차적으로 반영 예정입니다.</div>';
      return;
    }
    list.innerHTML = filtered.map(item => agriResearchCardHtml(item)).join('');
  }

  function agriResearchCardHtml(item){
    const utils = u();
    const audience = (item.audience || item.whoCares || []).slice(0, 4).join(' · ');
    const crops = (item.relatedCrops || []).slice(0, 4).join(' · ');
    const detailId = `agri-research-${utils.escapeAttr(item.id)}`;
    const tone = agriResearchTone(item.category);
    const badges = `<div class="agri-badges"><span class="agri-badge">${utils.escapeHtml(item.category || '연구동향')}</span>${utils.tagBadges(item.tags)}</div>`;
    return `<article class="agri-research-card ${tone}" id="${detailId}">
      <div class="agri-card-title">${utils.escapeHtml(item.simpleTitle || item.title)}</div>
      <div class="agri-research-meta-row">
        <div class="agri-date">배포일: ${utils.escapeHtml(utils.displayDate(item.sourcePublishedAt || item.sourceYear, '배포일 확인 중'))}</div>
        <div class="agri-card-actions"><button type="button" onclick="toggleAgriResearchDetail('${detailId}')">자세히 보기</button></div>
      </div>
      <div class="agri-research-detail">
        ${badges}
        <div class="agri-research-summary">${utils.escapeHtml(item.summary)}</div>
        <div class="agri-meta">관심: ${utils.escapeHtml(audience || '농가 · 연구기관 · 관련 업체')}</div>
        ${crops ? `<div class="agri-meta">관련 작물: ${utils.escapeHtml(crops)}</div>` : ''}
        <br>
        <strong>원래 자료명</strong><br>${utils.escapeHtml(item.title || '공식자료 확인 예정')}<br><br>
        <strong>왜 흥미로운가</strong><br>${utils.escapeHtml(item.whyInteresting || '재배와 관리 판단에 참고할 수 있는 연구 흐름입니다.')}<br><br>
        <strong>공식자료 확인</strong><br>${item.sourceUrl ? `<a class="agri-source-link" href="${utils.escapeAttr(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">${utils.escapeHtml(item.sourceName || '공식자료')} 보기</a>` : utils.escapeHtml(item.sourceName || '공식자료 확인 예정')}
      </div>
    </article>`;
  }

  function agriResearchTone(category){
    const key = String(category || '');
    if(key.includes('스마트'))return 'tone-smart';
    if(key.includes('AI') || key.includes('로봇'))return 'tone-ai';
    if(key.includes('품종') || key.includes('종자'))return 'tone-seed';
    if(key.includes('시설'))return 'tone-facility';
    if(key.includes('기후'))return 'tone-climate';
    if(key.includes('병해충') || key.includes('작물보호'))return 'tone-protection';
    if(key.includes('토양') || key.includes('비료'))return 'tone-soil';
    return 'tone-smart';
  }

  function toggleAgriResearchDetail(id){
    const card = document.getElementById(id);
    if(!card)return;
    card.classList.toggle('open');
    const btn = card.querySelector('.agri-card-actions button');
    if(btn)btn.textContent = card.classList.contains('open') ? '접기' : '자세히 보기';
  }

  window.KFAgriResearch = {
    loadAgriResearch,
    renderAgriResearch,
    toggleAgriResearchDetail
  };

  window.loadAgriResearch = loadAgriResearch;
  window.renderAgriResearch = renderAgriResearch;
  window.toggleAgriResearchDetail = toggleAgriResearchDetail;
})();

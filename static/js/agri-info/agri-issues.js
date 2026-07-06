(function(){
  const DATA_URL = 'data/agri-info/agri-weekly-issues.json';

  function u(){
    return window.KFAgriInfoUtils;
  }

  async function loadAgriIssues(){
    const grid = document.getElementById('agriIssueGrid');
    if(!grid)return;
    try{
      const res = await fetch(DATA_URL, { cache: 'no-store' });
      if(!res.ok)throw new Error('issue data unavailable');
      const items = await res.json();
      const issues = (Array.isArray(items) ? items : []).filter(item => item.status !== 'hidden');
      grid.innerHTML = issues.length
        ? issues.map(issueCardHtml).join('')
        : '<div class="agri-empty">이번 주 농업 이슈는 순차적으로 정리 예정입니다.</div>';
    }catch(error){
      console.warn('농업 이슈 데이터를 불러오지 못했습니다.', error?.message);
      grid.innerHTML = '<div class="agri-empty">이번 주 농업 이슈는 순차적으로 정리 예정입니다.</div>';
    }
  }

  function issueCardHtml(item){
    const utils = u();
    const body = `<strong>${utils.escapeHtml(item.title)}</strong><span>${utils.escapeHtml(item.summary)}</span>`;
    if(item.href){
      return `<a class="agri-issue-card" href="${utils.escapeAttr(item.href)}">${body}</a>`;
    }
    return `<div class="agri-issue-card">${body}</div>`;
  }

  window.KFAgriIssues = {
    loadAgriIssues
  };
  window.loadAgriIssues = loadAgriIssues;
})();

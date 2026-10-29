'use strict';

// The page reads only a reviewed snapshot. Provider responses never enter this UI.
const POLICY_FILTERS = {
  regions: ['서울','인천','경기','강원','대전·세종','충북','충남','광주','전북','전남','대구','경북','부산·울산','경남','제주'],
  targets: ['농업인','청년농','농업법인','귀농귀촌','시설재배','스마트팜','홈가드닝'],
  categories: ['스마트팜','시설원예','농기계','친환경','유통·가공','교육','재배기술','농자재']
};

function policyEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

function policyList(value) { return Array.isArray(value) ? value : [value].filter(Boolean); }

function policyDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === value;
}

function policyKstToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function policyOfficialUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['bojo.go.kr','www.bojo.go.kr'].includes(url.hostname) &&
      !url.username && !url.password && !url.port ? url.href : null;
  } catch (_) { return null; }
}

function policyValid(item) {
  return item && item.reviewStatus === 'approved' && item.sourceId && item.externalId && item.title && item.agency &&
    Array.isArray(item.region) && Array.isArray(item.targets) && Array.isArray(item.categories) &&
    policyDate(item.applicationStart) && policyDate(item.applicationEnd) && policyDate(item.publishedAt) &&
    item.applicationStart <= item.applicationEnd && !!policyOfficialUrl(item.officialUrl) &&
    /^[a-f0-9]{64}$/.test(item.sourceHash || '') && !Number.isNaN(Date.parse(item.reviewedAt));
}

function policySnapshot(data) {
  if (!data || data.schemaVersion !== 1 || data.publishMode !== 'approved_only' || !Array.isArray(data.items) ||
      (data.items.length && (!data.snapshotAt || Number.isNaN(Date.parse(data.snapshotAt)))) ||
      !data.items.every(policyValid)) throw new Error('invalid approved snapshot');
  return data;
}

function policyStatus(item, today) {
  if (item.applicationStart > today) return '예정';
  if (item.applicationEnd < today) return '마감';
  return '접수 중';
}

function policyFilter(items, filters, today) {
  return items.filter(item =>
    (!filters.region || item.region.includes('전국') || item.region.includes(filters.region)) &&
    (!filters.target || item.targets.includes(filters.target)) &&
    (!filters.category || item.categories.includes(filters.category)) &&
    (!filters.status || policyStatus(item, today) === filters.status))
    .sort((a,b) => a.applicationEnd.localeCompare(b.applicationEnd) || b.publishedAt.localeCompare(a.publishedAt));
}

function policyCard(item, today, sample = false) {
  const status = policyStatus(item, today);
  const location = policyList(item.region).join('·');
  const target = policyList(item.targets).join('·');
  const url = policyOfficialUrl(item.officialUrl);
  return `<article class="policy-row">
    <div class="policy-row-head"><span class="policy-state ${status === '접수 중' ? 'open' : ''}">${policyEscape(status)}</span><span class="policy-period">${policyEscape(item.applicationStart)} ~ ${policyEscape(item.applicationEnd)}</span></div>
    <h3>${policyEscape(item.title)}</h3>
    <div class="policy-row-meta">${policyEscape(item.agency)} · ${policyEscape(location)} · ${policyEscape(target)}</div>
    ${sample ? '<span class="policy-sample-link">화면 시험 자료 · 신청 불가</span>' : `<a class="policy-link" href="${policyEscape(url)}" target="_blank" rel="noopener noreferrer">공식 공고 보기 <span aria-hidden="true">↗</span></a>`}
  </article>`;
}

function policyReferenceCard(item) {
  const links = policyList(item.relatedLinks).filter(link => link && /^(mfg|crop-guide|public-data|agri-weather)\.html(?:[?#]|$)/.test(link.url || ''));
  return `<article class="policy-row policy-reference"><h3>${policyEscape(item.title)}</h3><div class="policy-row-meta">${policyEscape(policyList(item.category).join('·'))} · ${policyEscape(item.agency)}</div>
    <div class="policy-reference-links">${links.slice(0,2).map(link => `<a href="${policyEscape(link.url)}">${policyEscape(link.label)}</a>`).join('')}</div></article>`;
}

function policyFillSelect(select, label, values) {
  select.innerHTML = `<option value="">${label}</option>` + values.map(value => `<option value="${policyEscape(value)}">${policyEscape(value)}</option>`).join('');
}

async function initPolicyPage() {
  const $ = id => document.getElementById(id);
  const region = $('regionFilter'), target = $('targetFilter'), category = $('categoryFilter'), status = $('statusFilter');
  policyFillSelect(region, '전체 지역', POLICY_FILTERS.regions);
  policyFillSelect(target, '전체 대상', POLICY_FILTERS.targets);
  policyFillSelect(category, '전체 분야', POLICY_FILTERS.categories);

  let approved = [], references = [], snapshotAt = null, loadError = false;
  const sample = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname) && new URLSearchParams(window.location.search).get('policyPreview') === 'sample';
  if (sample) { $('sampleBanner').hidden = false; document.title = '[샘플] 정책·지원 - KFarmAI'; }

  function render() {
    const today = policyKstToday();
    const selected = {region:region.value,target:target.value,category:category.value,status:status.value};
    const filtered = policyFilter(approved, selected, today);
    $('countText').textContent = `확인된 공고 ${filtered.length}건`;
    $('snapshotText').textContent = sample ? '화면 시험 자료' : snapshotAt ? `승인 자료 기준 ${snapshotAt.slice(0,10)}` : '승인 자료 준비 중';
    $('approvedList').innerHTML = filtered.length ? filtered.map(item => policyCard(item, today, sample)).join('') :
      `<div class="policy-empty">${loadError ? '승인 공고 자료를 불러오지 못했습니다.' : approved.length ? '조건에 맞는 확인된 공고가 없습니다.' : '현재 확인된 신청 공고가 없습니다.'}</div>`;
    const related = references.filter(item =>
      (!selected.region || policyList(item.region).includes('전국') || policyList(item.region).includes(selected.region)) &&
      (!selected.target || policyList(item.target).includes(selected.target)) &&
      (!selected.category || policyList(item.category).includes(selected.category)));
    $('referenceCount').textContent = `지원 유형 참고 ${related.length}건`;
    $('programList').innerHTML = related.length ? related.map(policyReferenceCard).join('') : '<div class="policy-empty">조건에 맞는 지원 유형이 없습니다.</div>';
  }

  [region,target,category,status].forEach(select => select.addEventListener('change', render));
  $('resetButton').addEventListener('click', () => { [region,target,category].forEach(select => {select.value = '';}); status.value = '접수 중'; render(); });
  render();
  const approvedPath = sample ? 'tests/fixtures/policy-support/approved.sample.json' : 'data/policy-support-approved.json';
  const [approvedResult, referenceResult] = await Promise.allSettled([
    fetch(approvedPath, {cache:'no-store'}).then(response => {if (!response.ok) throw new Error('approved fetch failed'); return response.json();}).then(policySnapshot),
    fetch('data/subsidy_programs.json', {cache:'force-cache'}).then(response => {if (!response.ok) throw new Error('reference fetch failed'); return response.json();})
  ]);
  if (approvedResult.status === 'fulfilled') { approved = approvedResult.value.items; snapshotAt = approvedResult.value.snapshotAt; }
  else loadError = true;
  if (referenceResult.status === 'fulfilled' && Array.isArray(referenceResult.value)) references = referenceResult.value;
  render();
}

if (typeof module !== 'undefined' && module.exports) module.exports = {policyDate,policyKstToday,policyOfficialUrl,policyValid,policySnapshot,policyStatus,policyFilter,policyCard};
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => { initPolicyPage().catch(() => { const list = document.getElementById('approvedList'); if (list) list.textContent = '승인 공고 자료를 불러오지 못했습니다.'; }); });

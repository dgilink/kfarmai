const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'search_index.json');
const CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.isFile() && entry.name.endsWith('.html') && !entry.name.includes(' (1)')) acc.push(full);
  }
  return acc;
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pick(html, regex) {
  const match = html.match(regex);
  return match ? decode(match[1]).trim() : '';
}

function decode(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function normalize(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function chosung(value) {
  return String(value || '').split('').map(ch => {
    const code = ch.charCodeAt(0) - 44032;
    if (code >= 0 && code <= 11171) return CHO[Math.floor(code / 588)];
    return /[a-z0-9ㄱ-ㅎ]/i.test(ch) ? ch.toLowerCase() : '';
  }).join('');
}

function keywordsFrom(text) {
  const words = normalize(text).match(/[가-힣a-z0-9]{2,}/g) || [];
  return [...new Set(words)].slice(0, 18);
}

function htmlItem(file, source, type) {
  const html = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const title = pick(html, /<title[^>]*>([\s\S]*?)<\/title>/i).replace(/\s*-\s*kFarmAI\s*$/i, '') || pick(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i) || rel;
  const h1 = pick(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const description = pick(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) || stripHtml(html).slice(0, 160);
  const text = `${title} ${h1} ${description} ${stripHtml(html).slice(0, 900)}`;
  return {
    id: rel.replace(/[^a-zA-Z0-9가-힣]+/g, '-').replace(/^-|-$/g, ''),
    type,
    title,
    description,
    keywords: keywordsFrom(text),
    url: rel,
    source,
    region: '',
    chosung: chosung(text)
  };
}

function addJsonItems(items, file, source, type, mapper) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) return;
  try {
    const json = JSON.parse(fs.readFileSync(full, 'utf8'));
    (Array.isArray(json) ? json : []).forEach((row, index) => {
      const mapped = mapper(row, index);
      if (!mapped?.title) return;
      const text = `${mapped.title} ${mapped.description || ''} ${(mapped.keywords || []).join(' ')}`;
      items.push({
        id: `${source}-${index}`,
        type,
        title: mapped.title,
        description: mapped.description || '',
        keywords: [...new Set([...(mapped.keywords || []), ...keywordsFrom(text)])].slice(0, 18),
        url: mapped.url,
        source,
        region: mapped.region || '',
        chosung: chosung(text)
      });
    });
  } catch (err) {
    console.warn(`skip ${file}: ${err.message}`);
  }
}

const items = [];
walk(path.join(ROOT, 'q')).forEach(file => items.push(htmlItem(file, 'q', '질문·정보')));
walk(path.join(ROOT, 'kb')).forEach(file => items.push(htmlItem(file, 'kb', '농업 지식')));

[
  ['diagnosis.html', 'AI 진단', 'AI 진단하기'],
  ['diagnosis-cases.html', '진단 사례', 'AI 진단사례 보기'],
  ['public-data.html', '공공데이터', '공공데이터 확인'],
  ['contest-demo.html', '데모', '공모전 데모'],
  ['ai-safety.html', 'AI 안전', 'AI 안전 원칙'],
  ['knowledge-hub.html', '농업 지식', '지식 허브'],
  ['tools-soil.html', '계산기 도구', '상토 계산기'],
  ['tools-fertilizer.html', '계산기 도구', '액비 계산기'],
  ['tools-pesticide.html', '계산기 도구', '농약 희석 계산기'],
  ['agri_map.html', '농약사·업체', '주변 농약방 위치 보기'],
  ['santo.html', '농자재 업체', '상토 업체 정보'],
  ['fert.html', '농자재 업체', '비료 업체 정보'],
  ['cpa.html', '농자재 업체', '작물보호제 업체 정보']
].forEach(([url, type, fallbackTitle]) => {
  const file = path.join(ROOT, url);
  if (fs.existsSync(file)) {
    const item = htmlItem(file, url.replace('.html', ''), type);
    if (!item.title || item.title === url) item.title = fallbackTitle;
    item.url = url;
    items.push(item);
  }
});

[
  {
    id: 'manual-agri-map-pesticide-shop',
    type: '농약사·업체',
    title: '주변 농약방 찾기',
    description: '농약사, 농약방, 농자재점 위치와 지도 정보를 확인합니다.',
    keywords: ['농약방', '농약사', '농자재점', '지도', '주변'],
    url: 'agri_map.html',
    source: 'manual',
    region: ''
  },
  {
    id: 'manual-rda-public-data',
    type: '공공데이터 기관',
    title: '농진청 공공데이터 확인',
    description: '농촌진흥청, 농약안전정보시스템, 공공데이터 기반 확인 페이지입니다.',
    keywords: ['농진청', '농촌진흥청', '공공데이터', '농약안전정보시스템', '등록정보'],
    url: 'public-data.html',
    source: 'manual',
    region: ''
  }
].forEach(item => {
  const text = `${item.title} ${item.description} ${item.keywords.join(' ')}`;
  item.searchText = normalize(text);
  item.chosung = chosung(text);
  items.push(item);
});

addJsonItems(items, 'data/diagnosis_cases.json', 'diagnosis_cases', '진단 사례', row => ({
  title: row.title || row.crop || row.diagnosis,
  description: row.summary || row.description || row.symptoms || '',
  keywords: [row.crop, row.disease, row.region].filter(Boolean),
  url: 'diagnosis-cases.html',
  region: row.region || ''
}));

addJsonItems(items, 'data/community_threads.json', 'community_threads', '커뮤니티 질문', row => ({
  title: row.title,
  description: row.summary || row.aiSummary || '',
  keywords: [row.channelName, row.category, ...(row.labels || [])].filter(Boolean),
  url: `channel.html?slug=${encodeURIComponent(row.channelSlug || '')}`,
  region: row.region || ''
}));

addJsonItems(items, 'data/public_data_sources.json', 'public_data_sources', '공공데이터 기관', row => ({
  title: row.title || row.name || row.organization,
  description: row.description || row.summary || row.url || '',
  keywords: [row.category, row.organization].filter(Boolean),
  url: 'public-data.html',
  region: row.region || ''
}));

const seen = new Set();
const unique = items.filter(item => {
  const key = `${item.url}|${item.title}`;
  if (seen.has(key)) return false;
  seen.add(key);
  item.searchText = normalize(`${item.title} ${item.description} ${item.keywords.join(' ')} ${item.region}`);
  item.chosung = item.chosung || chosung(item.searchText);
  return true;
});

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(unique, null, 2), 'utf8');
console.log(`search index: ${unique.length} items -> ${path.relative(ROOT, OUT)}`);

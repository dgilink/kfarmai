/**
 * kFarmAI 초성/축약 검색 유틸리티
 * 다른 기능과 독립적으로 작동 (모듈화)
 */

const CHO_LIST = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

function getChosung(str) {
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i) - 0xAC00;
    if (code >= 0 && code <= 11171) {
      result += CHO_LIST[Math.floor(code / 588)];
    } else {
      result += str[i];
    }
  }
  return result;
}

function matchChosung(query, target) {
  // 순수 초성 검색 (ㄱㅅ, ㄴㅈㅊ 등)
  const isOnlyChosung = /^[ㄱ-ㅎ]+$/.test(query);
  if (isOnlyChosung) {
    return getChosung(target).includes(query);
  }
  return false;
}

function matchAbbr(query, target) {
  // 축약 검색: "농진청" → "농촌진흥청"
  // 각 글자가 target에 순서대로 포함되는지 확인
  if (query.length < 2) return false;
  let pos = 0;
  for (let i = 0; i < query.length; i++) {
    const found = target.indexOf(query[i], pos);
    if (found === -1) return false;
    pos = found + 1;
  }
  // 축약이 의미있으려면 target이 query보다 길어야 함
  return target.length > query.length;
}

function smartSearch(query, items) {
  if (!query || query.length < 1) return [];
  const q = query.trim();
  
  return items.filter(d => {
    const name = d.name || '';
    const addr = d.addr || '';
    const cat = d.cat || '';
    
    // 1. 일반 포함 검색 (기존)
    if (name.includes(q) || addr.includes(q) || cat.includes(q)) return true;
    
    // 2. 초성 검색 (ㄱㅅ → 금성)
    if (matchChosung(q, name)) return true;
    
    // 3. 축약 검색 (농진청 → 농촌진흥청)
    if (matchAbbr(q, name)) return true;
    
    return false;
  });
}

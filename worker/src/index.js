'use strict';

const SERVICE_NAME = 'kfarmai-api';
const KAMIS_ENDPOINT = 'https://www.kamis.or.kr/service/price/xml.do';
const NCPMS_ENDPOINT = 'http://ncpms.rda.go.kr/npmsAPI/service';
const ALLOWED_ORIGINS = new Set([
  'https://kfarmai.com',
  'https://www.kfarmai.com',
  'http://127.0.0.1:8787',
  'http://localhost:8787'
]);
const KAMIS_CACHE = 'public, max-age=1800';
const NCPMS_CACHE = 'public, max-age=86400';
const SAFE_MARKET_NOTICE = '농산물 시세는 판매·중개 목적이 아니라 시장 흐름 참고자료입니다.';
const SAFE_NCPMS_NOTICE = '공공정보 확인용 참고자료입니다. 실제 판단은 공식 제공처와 전문가 상담을 함께 확인하세요.';

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);

    try {
      if (request.method !== 'GET') {
        return json({ ok: false, error: 'method_not_allowed' }, 405, cors);
      }

      if (url.pathname === '/api/health') {
        return json({ ok: true, service: SERVICE_NAME }, 200, cors);
      }

      if (url.pathname === '/api/kamis/prices') {
        return handleKamis(url, env, cors);
      }

      if (url.pathname === '/api/ncpms/diseases') {
        return handleNcpms(url, env, cors);
      }

      return json({ ok: false, error: 'not_found' }, 404, cors);
    } catch (error) {
      return json({
        ok: false,
        fallback: true,
        notice: '현재 공공정보를 불러오지 못했습니다. 잠시 후 다시 확인하거나 공식 제공처를 확인해주세요.'
      }, 200, cors);
    }
  }
};

async function handleKamis(url, env, cors) {
  const item = cleanText(url.searchParams.get('item')) || '토마토';
  const date = cleanDate(url.searchParams.get('date')) || todayKst();

  if (!env.KAMIS_API_KEY || !env.KAMIS_API_ID) {
    return json(kamisFallback(item, date, true), 200, cors, KAMIS_CACHE);
  }

  try {
    const apiUrl = new URL(KAMIS_ENDPOINT);
    apiUrl.searchParams.set('action', 'dailySalesList');
    apiUrl.searchParams.set('p_cert_key', env.KAMIS_API_KEY);
    apiUrl.searchParams.set('p_cert_id', env.KAMIS_API_ID);
    apiUrl.searchParams.set('p_returntype', 'json');

    const response = await fetch(apiUrl, {
      headers: { Accept: 'application/json, text/plain, */*' },
      cf: { cacheTtl: 1800, cacheEverything: true }
    });
    if (!response.ok) throw new Error(`kamis_http_${response.status}`);

    const payload = await parseFlexibleResponse(response);
    const items = normalizeKamisItems(payload, item, date);
    if (!items.length) throw new Error('kamis_empty_items');

    return json({
      source: 'KAMIS',
      updatedAt: date,
      items,
      fallback: false,
      notice: SAFE_MARKET_NOTICE
    }, 200, cors, KAMIS_CACHE);
  } catch (error) {
    return json(kamisFallback(item, date, true), 200, cors, KAMIS_CACHE);
  }
}

async function handleNcpms(url, env, cors) {
  const crop = cleanText(url.searchParams.get('crop')) || '';
  const keyword = cleanText(url.searchParams.get('keyword')) || '';

  if (!env.NCPMS_API_KEY) {
    return json(ncpmsFallback(), 200, cors, NCPMS_CACHE);
  }

  try {
    const listRows = await fetchNcpmsList(env.NCPMS_API_KEY, crop);
    if (!listRows.length) throw new Error('ncpms_empty_list');

    const detailRows = await Promise.all(
      listRows.slice(0, 24).map(row => fetchNcpmsDetail(env.NCPMS_API_KEY, row))
    );
    const normalized = detailRows
      .filter(row => row.name || row.cropName)
      .sort((a, b) => diseaseScore(b, crop, keyword) - diseaseScore(a, crop, keyword));
    const keywordMatches = keyword ? normalized.filter(row => diseaseScore(row, '', keyword) > 0) : normalized;
    const items = (keywordMatches.length ? keywordMatches : normalized).slice(0, 12);
    if (!items.length) throw new Error('ncpms_empty_items');

    return json({
      source: 'NCPMS',
      items,
      fallback: false,
      notice: SAFE_NCPMS_NOTICE
    }, 200, cors, NCPMS_CACHE);
  } catch (error) {
    return json(ncpmsFallback(), 200, cors, NCPMS_CACHE);
  }
}

async function fetchNcpmsList(apiKey, crop) {
  const apiUrl = new URL(NCPMS_ENDPOINT);
  apiUrl.searchParams.set('apiKey', apiKey);
  apiUrl.searchParams.set('serviceCode', 'SVC01');
  apiUrl.searchParams.set('serviceType', 'AA001');
  apiUrl.searchParams.set('displayCount', '50');
  apiUrl.searchParams.set('startPoint', '1');
  if (crop) apiUrl.searchParams.set('cropName', crop);

  const response = await fetch(apiUrl, {
    headers: { Accept: 'application/xml, text/xml, */*' },
    cf: { cacheTtl: 86400, cacheEverything: true }
  });
  if (!response.ok) throw new Error(`ncpms_list_http_${response.status}`);
  return normalizeNcpmsList(await response.text());
}

async function fetchNcpmsDetail(apiKey, listRow) {
  if (!listRow.sickKey) return normalizeNcpmsRow(listRow);

  const apiUrl = new URL(NCPMS_ENDPOINT);
  apiUrl.searchParams.set('apiKey', apiKey);
  apiUrl.searchParams.set('serviceCode', 'SVC05');
  apiUrl.searchParams.set('serviceType', 'AA001');
  apiUrl.searchParams.set('sickKey', listRow.sickKey);

  try {
    const response = await fetch(apiUrl, {
      headers: { Accept: 'application/xml, text/xml, */*' },
      cf: { cacheTtl: 86400, cacheEverything: true }
    });
    if (!response.ok) throw new Error(`ncpms_detail_http_${response.status}`);
    return normalizeNcpmsDetail(await response.text(), listRow);
  } catch {
    return normalizeNcpmsRow(listRow);
  }
}

function normalizeKamisItems(payload, itemQuery, date) {
  const raw = firstArray(
    payload?.price,
    payload?.data?.item,
    payload?.data,
    payload?.response?.body?.items?.item,
    payload?.items?.item,
    payload?.items
  );

  return raw
    .map(row => {
      const item = compactName(pick(row, ['productName', 'item_name', 'itemname', 'itemName', 'item', 'product_name', '품목명'], itemQuery));
      return {
        item,
        market: pick(row, ['market_name', 'marketName', 'market', 'countyname', 'product_cls_name', '시장명'], '공공 시세'),
        date: pick(row, ['lastest_day', 'day1', 'regday', 'date', 'yyyy', '조사일자'], date),
        unit: pick(row, ['unit', 'unit_name', 'unitName', '단위'], '확인 필요'),
        price: toNullableNumber(pick(row, ['dpr1', 'price', 'dpr2', 'avg_price', '가격'], null)),
        memo: '시장 흐름 참고자료입니다.',
        type: '공공 시세 정보'
      };
    })
    .filter(row => matchesText(row.item, itemQuery));
}

function normalizeNcpmsList(text) {
  try {
    const jsonPayload = JSON.parse(text);
    const raw = firstArray(
      jsonPayload?.service?.items?.item,
      jsonPayload?.response?.body?.items?.item,
      jsonPayload?.body?.items?.item,
      jsonPayload?.items?.item,
      jsonPayload?.items
    );
    return raw.map(normalizeNcpmsRow).filter(row => row.sickKey || row.name || row.cropName);
  } catch {
    const itemXml = String(text).match(/<item[^>]*>[\s\S]*?<\/item>/gi) || [];
    return itemXml.map(row => normalizeNcpmsRow({
      sickKey: xmlTag(row, 'sickKey'),
      sickNameKor: xmlTag(row, 'sickNameKor') || xmlTag(row, 'sickName'),
      cropName: xmlTag(row, 'cropName'),
      thumbImg: xmlTag(row, 'thumbImg'),
      oriImg: xmlTag(row, 'oriImg')
    })).filter(row => row.sickKey || row.name || row.cropName);
  }
}

function normalizeNcpmsDetail(text, fallbackRow) {
  try {
    const jsonPayload = JSON.parse(text);
    return normalizeNcpmsRow({ ...fallbackRow, ...(jsonPayload?.service || jsonPayload) });
  } catch {
    return normalizeNcpmsRow({
      ...fallbackRow,
      cropName: xmlTag(text, 'cropName') || fallbackRow.cropName,
      sickNameKor: xmlTag(text, 'sickNameKor') || fallbackRow.name,
      symptoms: xmlTag(text, 'symptoms'),
      developmentCondition: xmlTag(text, 'developmentCondition'),
      preventionMethod: xmlTag(text, 'preventionMethod'),
      pathogenName: xmlTag(text, 'pathogenName'),
      thumbImg: xmlTag(text, 'thumbImg'),
      oriImg: xmlTag(text, 'oriImg')
    });
  }
}

function normalizeNcpmsRow(row) {
  const name = pick(row, ['name', 'sickNameKor', 'sickName'], '');
  return {
    sickKey: pick(row, ['sickKey'], ''),
    cropName: pick(row, ['cropName'], ''),
    name,
    type: classifyDisease(name),
    symptoms: stripHtml(pick(row, ['symptoms'], '')),
    environment: stripHtml(pick(row, ['developmentCondition', 'environment', 'occurrenceCondition'], '')),
    prevention: stripHtml(pick(row, ['preventionMethod'], '')),
    imageUrl: pick(row, ['thumbImg', 'oriImg', 'imageUrl', 'image'], ''),
    officialUrl: 'https://ncpms.rda.go.kr/'
  };
}

function kamisFallback(item, date, fallback) {
  return {
    source: 'KAMIS',
    updatedAt: date,
    items: [{
      item,
      market: '공공 시세',
      date,
      unit: '확인 필요',
      price: null,
      memo: '시장 흐름 참고자료입니다.',
      type: '공공 시세 정보'
    }],
    fallback,
    notice: SAFE_MARKET_NOTICE
  };
}

function ncpmsFallback() {
  return {
    source: 'NCPMS',
    items: [],
    fallback: true,
    notice: 'NCPMS 공공정보를 불러오지 못했습니다. 공식 제공처에서 작물명과 증상을 다시 확인해주세요.'
  };
}

async function parseFlexibleResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { items: xmlItems(text) };
  }
}

function xmlItems(text) {
  return (String(text).match(/<item[^>]*>[\s\S]*?<\/item>/gi) || []).map(item => ({
    item_name: xmlTag(item, 'item_name') || xmlTag(item, 'itemName'),
    market_name: xmlTag(item, 'market_name') || xmlTag(item, 'marketName') || xmlTag(item, 'product_cls_name'),
    regday: xmlTag(item, 'lastest_day') || xmlTag(item, 'day1') || xmlTag(item, 'regday'),
    unit: xmlTag(item, 'unit'),
    price: xmlTag(item, 'dpr1') || xmlTag(item, 'price')
  }));
}

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : 'https://kfarmai.com';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  };
}

function json(body, status = 200, cors = {}, cacheControl = 'no-store') {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cacheControl
    }
  });
}

function firstArray(...values) {
  const value = values.find(candidate => candidate !== undefined && candidate !== null);
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function pick(row, names, fallback) {
  for (const name of names) {
    if (row && row[name] !== undefined && row[name] !== null && row[name] !== '') return row[name];
  }
  return fallback;
}

function xmlTag(xml, tag) {
  const match = String(xml).match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? match[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
}

function matchesText(value, query) {
  if (!query) return true;
  return String(value || '').toLowerCase().includes(String(query).toLowerCase());
}

function diseaseScore(row, crop, keyword) {
  const detailText = [row.symptoms, row.environment, row.prevention].join(' ');
  let score = 0;
  if (crop && matchesText(row.cropName, crop)) score += 2;
  if (keyword && matchesText(row.name, keyword)) score += 8;
  if (keyword && matchesText(detailText, keyword)) score += 3;
  return score;
}

function toNullableNumber(value) {
  const normalized = String(value ?? '').replace(/[^\d.-]/g, '');
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function compactName(value) {
  const parts = String(value || '').split('/').map(part => part.trim()).filter(Boolean);
  if (!parts.length) return String(value || '');
  return [...new Set(parts)].join(' ');
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function classifyDisease(name) {
  return String(name || '').includes('충') ? '해충' : '병';
}

function cleanText(value) {
  return String(value || '').trim().slice(0, 40);
}

function cleanDate(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function todayKst() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, '0')}-${String(kst.getUTCDate()).padStart(2, '0')}`;
}

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
    apiUrl.searchParams.set('action', 'dailyPriceByCategoryList');
    apiUrl.searchParams.set('p_cert_key', env.KAMIS_API_KEY);
    apiUrl.searchParams.set('p_cert_id', env.KAMIS_API_ID);
    apiUrl.searchParams.set('p_returntype', 'json');
    apiUrl.searchParams.set('p_product_cls_code', '01');
    apiUrl.searchParams.set('p_regday', date);

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
    const apiUrl = new URL(NCPMS_ENDPOINT);
    apiUrl.searchParams.set('apiKey', env.NCPMS_API_KEY);
    apiUrl.searchParams.set('serviceCode', 'SVC01');
    apiUrl.searchParams.set('serviceType', 'AA001');
    apiUrl.searchParams.set('displayCount', '30');
    apiUrl.searchParams.set('startPoint', '1');

    const response = await fetch(apiUrl, {
      headers: { Accept: 'application/json, application/xml, text/xml, */*' },
      cf: { cacheTtl: 86400, cacheEverything: true }
    });
    if (!response.ok) throw new Error(`ncpms_http_${response.status}`);

    const text = await response.text();
    const items = normalizeNcpmsItems(text)
      .filter(row => matchesDisease(row, crop, keyword))
      .slice(0, 20);

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

function normalizeKamisItems(payload, itemQuery, date) {
  const raw = firstArray(
    payload?.data?.item,
    payload?.data,
    payload?.price,
    payload?.response?.body?.items?.item,
    payload?.items?.item,
    payload?.items
  );

  return raw
    .map(row => {
      const item = pick(row, ['item_name', 'itemName', 'item', 'productName', 'product_name', '품목명'], itemQuery);
      return {
        item,
        market: pick(row, ['market_name', 'marketName', 'market', 'countyname', '시장명'], '공공 시세'),
        date: pick(row, ['regday', 'date', 'yyyy', '조사일자'], date),
        unit: pick(row, ['unit', 'unit_name', 'unitName', '단위'], '확인 필요'),
        price: toNullableNumber(pick(row, ['price', 'dpr1', 'dpr2', 'avg_price', '가격'], null)),
        memo: '시장 흐름 참고자료입니다.',
        type: '공공 시세 정보'
      };
    })
    .filter(row => matchesText(row.item, itemQuery));
}

function normalizeNcpmsItems(text) {
  try {
    const jsonPayload = JSON.parse(text);
    const raw = firstArray(
      jsonPayload?.response?.body?.items?.item,
      jsonPayload?.body?.items?.item,
      jsonPayload?.items?.item,
      jsonPayload?.items
    );
    return raw.map(normalizeNcpmsRow).filter(row => row.sickNameKor || row.cropName);
  } catch {
    const itemXml = String(text).match(/<item[^>]*>[\s\S]*?<\/item>/gi) || [];
    return itemXml.map(row => normalizeNcpmsRow({
      sickKey: xmlTag(row, 'sickKey'),
      sickNameKor: xmlTag(row, 'sickNameKor') || xmlTag(row, 'sickName'),
      cropName: xmlTag(row, 'cropName'),
      symptoms: xmlTag(row, 'symptoms'),
      preventionMethod: xmlTag(row, 'preventionMethod'),
      pathogenName: xmlTag(row, 'pathogenName'),
      occurrenceCondition: xmlTag(row, 'environment')
    })).filter(row => row.sickNameKor || row.cropName);
  }
}

function normalizeNcpmsRow(row) {
  return {
    sickKey: pick(row, ['sickKey'], ''),
    cropName: pick(row, ['cropName'], ''),
    sickNameKor: pick(row, ['sickNameKor', 'sickName'], ''),
    symptoms: pick(row, ['symptoms'], ''),
    occurrenceCondition: pick(row, ['environment', 'occurrenceCondition'], ''),
    preventionMethod: pick(row, ['preventionMethod'], ''),
    pathogenName: pick(row, ['pathogenName'], ''),
    memo: '공공정보 확인과 안전사용기준 확인이 필요합니다.'
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
    notice: SAFE_NCPMS_NOTICE
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
    market_name: xmlTag(item, 'market_name') || xmlTag(item, 'marketName'),
    regday: xmlTag(item, 'regday'),
    unit: xmlTag(item, 'unit'),
    price: xmlTag(item, 'price') || xmlTag(item, 'dpr1')
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

function matchesDisease(row, crop, keyword) {
  const text = [row.cropName, row.sickNameKor, row.symptoms, row.occurrenceCondition].join(' ');
  return (!crop || matchesText(text, crop)) && (!keyword || matchesText(text, keyword));
}

function toNullableNumber(value) {
  const normalized = String(value ?? '').replace(/[^\d.-]/g, '');
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
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

'use strict';

const SERVICE_NAME = 'kfarmai-api';
const KAMIS_ENDPOINT = 'https://www.kamis.or.kr/service/price/xml.do';
const NCPMS_ENDPOINT = 'http://ncpms.rda.go.kr/npmsAPI/service';
const KMA_ENDPOINT = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst';
const NONGSARO_ENDPOINT = 'https://api.nongsaro.go.kr/service';
const PSIS_ENDPOINT = 'http://psis.rda.go.kr/openApi/service.do';
const MAFRA_OPENAPI_ENDPOINT = 'http://211.237.50.150:7080/openapi';
const MAFRA_FACILITY_VEGETABLE_API = 'Grid_20141222000000000136_1';
const ALLOWED_ORIGINS = new Set([
  'https://kfarmai.com',
  'https://www.kfarmai.com',
  'http://127.0.0.1:8787',
  'http://localhost:8787'
]);
const KAMIS_CACHE = 'public, max-age=1800';
const NCPMS_CACHE = 'public, max-age=86400';
const WEATHER_CACHE = 'public, max-age=900';
const NONGSARO_CACHE = 'public, max-age=21600';
const PSIS_CACHE = 'public, max-age=21600';
const MAFRA_CACHE = 'public, max-age=21600';
const SAFE_MARKET_NOTICE = '농산물 시세는 판매·중개 목적이 아니라 시장 흐름 참고자료입니다.';
const SAFE_NCPMS_NOTICE = '공공정보 확인용 참고자료입니다. 실제 판단은 공식 제공처와 전문가 상담을 함께 확인하세요.';
const SAFE_WEATHER_NOTICE = '기상청 단기예보 기준 농작업 참고 정보입니다.';
const SAFE_PUBLIC_INFO_NOTICE = '공식 공공정보 확인용 참고자료입니다. 실제 관리는 현장 상황과 공식 제공처를 함께 확인하세요.';
const SAFE_MAFRA_FACILITY_NOTICE = '시설채소 생산실적은 지역·품목별 생산 규모를 확인하는 통계 참고자료입니다.';
const SAFE_MAFRA_FLOWER_NOTICE = '화훼류 시세는 시장 흐름 참고자료이며 실제 거래가격은 품질, 규격, 시장, 유통경로에 따라 달라질 수 있습니다.';

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

      if (url.pathname === '/api/kamis/price-summary') {
        return handleKamisPriceSummary(url, env, cors);
      }

      if (url.pathname === '/api/kamis/price-trend') {
        return handleKamisPriceTrend(url, env, cors);
      }

      if (url.pathname === '/api/auction/prices') {
        return handleAuctionPrices(url, env, cors);
      }

      if (url.pathname === '/api/ncpms/diseases') {
        return handleNcpms(url, env, cors);
      }

      if (url.pathname === '/api/nongsaro/service') {
        return handleNongsaroService(url, env, cors);
      }

      if (url.pathname === '/api/psis/pesticide-safety') {
        return handlePsisPesticideSafety(url, env, cors);
      }

      if (url.pathname === '/api/agri/public-info') {
        return handleAgriPublicInfo(url, env, cors);
      }

      if (url.pathname === '/api/weather/forecast') {
        return handleWeatherForecast(url, env, cors);
      }

      if (url.pathname === '/api/mafra/facility-vegetables') {
        return handleMafraFacilityVegetables(url, env, cors);
      }

      if (url.pathname === '/api/mafra/flower-prices') {
        return handleMafraFlowerPrices(url, env, cors);
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

async function handleMafraFacilityVegetables(url, env, cors) {
  const item = cleanText(url.searchParams.get('item')) || '';
  const region = cleanText(url.searchParams.get('region')) || '';
  const year = cleanYear(url.searchParams.get('year')) || '2023';

  if (!env.MAFRA_SERVICE_KEY) {
    return json(mafraFacilityFallback('missing_service_key'), 200, cors, MAFRA_CACHE);
  }

  try {
    const apiUrl = new URL(`${MAFRA_OPENAPI_ENDPOINT}/${env.MAFRA_SERVICE_KEY}/json/${MAFRA_FACILITY_VEGETABLE_API}/1/1000`);
    apiUrl.searchParams.set('EXAMIN_YEAR', year);
    if (region) apiUrl.searchParams.set('AREA_SE', region);
    if (item) apiUrl.searchParams.set('PRDLST', item);

    const response = await fetch(apiUrl, {
      headers: { Accept: 'application/json, text/plain, */*' },
      cf: { cacheTtl: 21600, cacheEverything: true }
    });
    if (!response.ok) throw new Error(`mafra_facility_http_${response.status}`);

    const payload = await parseFlexibleResponse(response);
    const items = normalizeMafraFacilityItems(payload, { item, region, year });
    if (!items.length) throw new Error('mafra_facility_empty_items');

    return json({
      ok: true,
      source: 'MAFRA',
      dataset: '시설채소 생산실적',
      fallback: false,
      items,
      notice: SAFE_MAFRA_FACILITY_NOTICE
    }, 200, cors, MAFRA_CACHE);
  } catch (error) {
    return json(mafraFacilityFallback('mafra_facility_fetch_failed'), 200, cors, MAFRA_CACHE);
  }
}

function handleMafraFlowerPrices(url, env, cors) {
  return json(mafraFlowerFallback(env.MAFRA_SERVICE_KEY ? 'endpoint_pending' : 'missing_service_key'), 200, cors, MAFRA_CACHE);
}

async function handleKamisPriceSummary(url, env, cors) {
  const item = cleanText(url.searchParams.get('item')) || '토마토';
  const date = cleanDate(url.searchParams.get('date')) || todayKst();
  const requestedType = cleanText(url.searchParams.get('type')) || '';

  try {
    const kamis = await fetchKamisDailySalesList(env, item, date);
    const summaryItems = buildPriceSummaryItems(item, date, kamis.items, false)
      .filter(row => !requestedType || row.type === requestedType);
    const fullItems = addMissingPriceTypes(summaryItems, item, date, requestedType);
    return json({
      ok: true,
      item,
      source: 'KAMIS/aT',
      fallback: kamis.fallback,
      items: fullItems,
      notice: 'KAMIS 및 공공데이터 기반 시장 흐름 참고자료입니다.'
    }, 200, cors, KAMIS_CACHE);
  } catch (error) {
    return json(priceSummaryFallback(item, date, requestedType), 200, cors, KAMIS_CACHE);
  }
}

async function handleKamisPriceTrend(url, env, cors) {
  const item = cleanText(url.searchParams.get('item')) || '토마토';
  const type = cleanText(url.searchParams.get('type')) || 'retail';
  const period = cleanText(url.searchParams.get('period')) || '30d';
  const date = todayKst();

  return json(priceTrendFallback(item, type, period, date), 200, cors, KAMIS_CACHE);
}

function handleAuctionPrices(url, env, cors) {
  const item = cleanText(url.searchParams.get('item')) || '토마토';
  const date = cleanDate(url.searchParams.get('date')) || todayKst();
  return json({
    ok: false,
    item,
    source: 'aT 공영도매시장 경매정보',
    fallback: true,
    items: [priceTypeFallback('auction', item, date)],
    notice: env.AT_AUCTION_KEY
      ? 'aT 경매정보 인증 정보는 준비되어 있으나, 정확한 API 엔드포인트 확인 후 연동할 예정입니다.'
      : 'aT 경매정보 연동 전 fallback 참고자료입니다.'
  }, 200, cors, KAMIS_CACHE);
}

async function fetchKamisDailySalesList(env, item, date) {
  if (!env.KAMIS_API_KEY || !env.KAMIS_API_ID) {
    return { items: kamisFallback(item, date, true).items, fallback: true };
  }

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
  return { items, fallback: false };
}

async function handleWeatherForecast(url, env, cors) {
  const region = cleanText(url.searchParams.get('region')) || '';
  const city = cleanText(url.searchParams.get('city')) || '';
  const nx = cleanGrid(url.searchParams.get('nx'));
  const ny = cleanGrid(url.searchParams.get('ny'));
  const displayName = [region, city].filter(Boolean).join(' ') || city || region || '선택 지역';

  if (!nx || !ny) {
    return json(weatherFallback('missing_grid', region, city, displayName), 200, cors, WEATHER_CACHE);
  }

  if (!env.KMA_SERVICE_KEY) {
    return json(weatherFallback('missing_service_key', region, city, displayName), 200, cors, WEATHER_CACHE);
  }

  const base = kmaBaseDateTime();

  try {
    const apiUrl = new URL(KMA_ENDPOINT);
    apiUrl.searchParams.set('pageNo', '1');
    apiUrl.searchParams.set('numOfRows', '1000');
    apiUrl.searchParams.set('dataType', 'JSON');
    apiUrl.searchParams.set('base_date', base.baseDate);
    apiUrl.searchParams.set('base_time', base.baseTime);
    apiUrl.searchParams.set('nx', nx);
    apiUrl.searchParams.set('ny', ny);
    appendServiceKey(apiUrl, env.KMA_SERVICE_KEY);

    const response = await fetch(apiUrl, {
      headers: { Accept: 'application/json, text/plain, */*' },
      cf: { cacheTtl: 900, cacheEverything: true }
    });
    if (!response.ok) throw new Error(`kma_http_${response.status}`);

    const payload = await parseFlexibleResponse(response);
    const resultCode = String(payload?.response?.header?.resultCode ?? '');
    if (resultCode && resultCode !== '00') throw new Error(`kma_result_${resultCode}`);

    const items = normalizeKmaItems(payload, base);
    return json({
      ok: true,
      source: 'KMA',
      fallback: false,
      region,
      city,
      displayName,
      baseDate: base.baseDate,
      baseTime: base.baseTime,
      items,
      notice: SAFE_WEATHER_NOTICE
    }, 200, cors, WEATHER_CACHE);
  } catch (error) {
    return json(weatherFallback('kma_fetch_failed', region, city, displayName, base), 200, cors, WEATHER_CACHE);
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

async function handleNongsaroService(url, env, cors) {
  const service = cleanToken(url.searchParams.get('service'));
  const operation = cleanToken(url.searchParams.get('operation'));
  if (!service || !operation) {
    return json(nongsaroFallback('missing_service_or_operation'), 200, cors, NONGSARO_CACHE);
  }
  if (!env.NONGSARO_API_KEY) {
    return json(nongsaroFallback('missing_service_key', service, operation), 200, cors, NONGSARO_CACHE);
  }

  try {
    const data = await fetchNongsaro(env.NONGSARO_API_KEY, service, operation, Object.fromEntries(url.searchParams));
    return json({
      ok: true,
      source: 'NONGSARO',
      service,
      operation,
      fallback: false,
      items: data.items,
      rawText: data.items.length ? undefined : data.summary,
      notice: '농사로 공식 OpenAPI 참고자료입니다.'
    }, 200, cors, NONGSARO_CACHE);
  } catch (error) {
    return json(nongsaroFallback('nongsaro_fetch_failed', service, operation), 200, cors, NONGSARO_CACHE);
  }
}

async function handlePsisPesticideSafety(url, env, cors) {
  const crop = cleanText(url.searchParams.get('crop')) || '';
  const keyword = cleanText(url.searchParams.get('keyword')) || crop;
  const serviceCode = cleanToken(url.searchParams.get('serviceCode')) || 'SVC01';
  const apiKey = env.PSIS_API_KEY || env.PEST_FERT_VENDOR_KEY || env.NONGSARO_API_KEY;

  if (!apiKey) {
    return json(psisFallback('missing_service_key', crop, keyword), 200, cors, PSIS_CACHE);
  }

  try {
    const data = await fetchPsis(apiKey, serviceCode, { crop, keyword });
    const items = normalizePsisItems(data.items, crop, keyword);
    if (!items.length) throw new Error('psis_empty_items');
    return json({
      ok: true,
      source: 'PSIS',
      fallback: false,
      crop,
      keyword,
      serviceCode,
      items,
      notice: '농약안전정보시스템 공식 안전사용기준 확인용 참고자료입니다.'
    }, 200, cors, PSIS_CACHE);
  } catch (error) {
    return json(psisFallback('psis_fetch_failed', crop, keyword), 200, cors, PSIS_CACHE);
  }
}

async function handleAgriPublicInfo(url, env, cors) {
  const crop = cleanText(url.searchParams.get('crop')) || '';
  const keyword = cleanText(url.searchParams.get('keyword')) || crop;
  const year = kstParts().date.slice(0, 4);
  const sections = [];

  const ncpms = await safePublicSection('NCPMS', async () => {
    if (!env.NCPMS_API_KEY) throw new Error('missing_ncpms_key');
    const rows = await fetchNcpmsList(env.NCPMS_API_KEY, crop);
    const details = await Promise.all(rows.slice(0, 8).map(row => fetchNcpmsDetail(env.NCPMS_API_KEY, row)));
    return details
      .filter(row => row.name || row.cropName)
      .sort((a, b) => diseaseScore(b, crop, keyword) - diseaseScore(a, crop, keyword))
      .slice(0, 3)
      .map(row => ({
        title: row.name || 'NCPMS 병해충 정보',
        summary: compactSentence(row.symptoms || row.environment || '작물명과 이상 증상을 공식 정보에서 함께 확인하세요.'),
        officialUrl: row.officialUrl || 'https://ncpms.rda.go.kr/'
      }));
  });
  sections.push(publicSection('NCPMS 병해충 정보', 'NCPMS', ncpms, '이상 증상이 보이면 NCPMS 공식 정보를 함께 확인하세요.', 'https://ncpms.rda.go.kr/'));

  const cropTech = await safePublicSection('NONGSARO_CROP_TECH', async () => {
    const data = await fetchNongsaro(env.NONGSARO_API_KEY, 'cropEbook', 'mainCategoryList', { subCategoryNm: crop });
    return normalizePublicItems(data.items, '농사로 작목별 재배기술', '농업기술길잡이에서 작목별 재배기술을 확인하세요.', 'https://www.nongsaro.go.kr/');
  }, env.NONGSARO_API_KEY);
  sections.push(publicSection('농사로 작목별 재배기술', 'NONGSARO', cropTech, '농사로 농업기술길잡이에서 작목별 재배기술을 함께 확인하세요.', 'https://www.nongsaro.go.kr/'));

  const occurrence = await safePublicSection('NONGSARO_OCCURRENCE', async () => {
    const data = await fetchNongsaro(env.NONGSARO_API_KEY, 'dbyhsCccrrncInfo', 'dbyhsCccrrncInfoList', { year });
    return normalizePublicItems(data.items, '병해충발생정보', '농촌진흥청 병해충발생정보를 참고자료로 확인하세요.', 'https://www.nongsaro.go.kr/');
  }, env.NONGSARO_API_KEY);
  sections.push(publicSection('병해충발생정보', 'NONGSARO', occurrence, '공식 병해충발생정보는 참고자료로 확인하세요.', 'https://www.nongsaro.go.kr/'));

  const safety = await safePublicSection('NONGSARO_SAFE_MANUAL', async () => {
    const data = await fetchNongsaro(env.NONGSARO_API_KEY, 'agchmSafeManual', 'nationList', {});
    return normalizePublicItems(data.items, '농약안전사용지침', '농약 사용 전 등록 작물, 대상, 사용시기, 희석배수, 안전사용기준을 확인하세요.', 'https://psis.rda.go.kr/');
  }, env.NONGSARO_API_KEY);
  sections.push(publicSection('농약안전사용지침', 'NONGSARO', safety, '농약 사용 전 안전사용기준을 공식 정보에서 확인하세요.', 'https://psis.rda.go.kr/'));

  const psis = await safePublicSection('PSIS_SAFETY', async () => {
    const apiKey = env.PSIS_API_KEY || env.PEST_FERT_VENDOR_KEY || env.NONGSARO_API_KEY;
    if (!apiKey) throw new Error('missing_psis_key');
    const data = await fetchPsis(apiKey, 'SVC01', { crop, keyword });
    return normalizePsisItems(data.items, crop, keyword).slice(0, 3);
  }, env.PSIS_API_KEY || env.PEST_FERT_VENDOR_KEY || env.NONGSARO_API_KEY);
  sections.push(publicSection('PSIS 안전사용기준', 'PSIS', psis, '농약안전정보시스템에서 등록 작물과 안전사용기준을 확인하세요.', 'https://psis.rda.go.kr/'));

  return json({
    ok: sections.some(section => !section.fallback),
    source: 'PUBLIC_AGRI_INFO',
    crop,
    keyword,
    fallback: sections.every(section => section.fallback),
    sections,
    notice: SAFE_PUBLIC_INFO_NOTICE
  }, 200, cors, NONGSARO_CACHE);
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

async function fetchNongsaro(apiKey, service, operation, params = {}) {
  if (!apiKey) throw new Error('missing_nongsaro_key');
  const apiUrl = new URL(`${NONGSARO_ENDPOINT}/${service}/${operation}`);
  apiUrl.searchParams.set('apiKey', apiKey);
  for (const [key, value] of Object.entries(params)) {
    if (['service', 'operation', 'apiKey'].includes(key)) continue;
    const cleanKey = cleanToken(key);
    const cleanValue = String(value || '').trim().slice(0, 80);
    if (cleanKey && cleanValue) apiUrl.searchParams.set(cleanKey, cleanValue);
  }

  const response = await fetch(apiUrl, {
    headers: { Accept: 'application/xml, text/xml, text/html, */*' },
    cf: { cacheTtl: 21600, cacheEverything: true }
  });
  if (!response.ok) throw new Error(`nongsaro_http_${response.status}`);
  const text = await response.text();
  if (isOpenApiError(text)) throw new Error('nongsaro_result_error');
  return {
    items: normalizeNongsaroItems(text),
    summary: compactSentence(stripHtml(text))
  };
}

async function fetchPsis(apiKey, serviceCode, params = {}) {
  const apiUrl = new URL(PSIS_ENDPOINT);
  apiUrl.searchParams.set('apiKey', apiKey);
  apiUrl.searchParams.set('serviceCode', serviceCode);
  apiUrl.searchParams.set('serviceType', 'AA001');
  apiUrl.searchParams.set('displayCount', '20');
  apiUrl.searchParams.set('startPoint', '1');
  if (params.crop) {
    apiUrl.searchParams.set('cropName', params.crop);
    apiUrl.searchParams.set('cropCheck', 'Y');
  }
  if (params.keyword) {
    apiUrl.searchParams.set('diseaseWeedName', params.keyword);
    apiUrl.searchParams.set('similarFlag', 'Y');
    apiUrl.searchParams.set('pestiKorName', params.keyword);
  }

  const response = await fetch(apiUrl, {
    headers: { Accept: 'application/xml, text/xml, */*' },
    cf: { cacheTtl: 21600, cacheEverything: true }
  });
  if (!response.ok) throw new Error(`psis_http_${response.status}`);
  const text = await response.text();
  if (isOpenApiError(text) || /ERR_10|ERR_20|ERR_90/i.test(text)) throw new Error('psis_result_error');
  return { items: normalizePsisXmlItems(text), summary: compactSentence(stripHtml(text)) };
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
        type: pick(row, ['product_cls_name', 'productClassName', 'product_cls_code', 'productClass', 'productclscode'], '공공 시세 정보')
      };
    })
    .filter(row => matchesText(row.item, itemQuery));
}

function buildPriceSummaryItems(item, date, kamisItems, fallback) {
  const retail = pickBestPriceItem(kamisItems, ['소매', 'retail', '01']) || pickBestPriceItem(kamisItems, []);
  const middleman = pickBestPriceItem(kamisItems, ['도매', '중도매', 'wholesale', '02']);
  const rows = [];
  if (retail) rows.push(normalizePriceTypeItem('retail', retail, item, date, fallback));
  if (middleman) rows.push(normalizePriceTypeItem('middleman', middleman, item, date, fallback));
  rows.push(priceTypeFallback('auction', item, date));
  rows.push(priceTypeFallback('eco', item, date));
  return dedupeByType(rows);
}

function normalizePriceTypeItem(type, sourceItem, item, date, fallback) {
  return {
    type,
    label: priceTypeLabel(type),
    itemName: sourceItem.item || item,
    unit: sourceItem.unit || '단위 확인',
    price: Number.isFinite(sourceItem.price) ? sourceItem.price : null,
    date: sourceItem.date || date,
    source: type === 'middleman' ? 'KAMIS' : 'KAMIS',
    fallback: Boolean(fallback),
    notice: typeNotice(type)
  };
}

function pickBestPriceItem(items, tokens) {
  const valid = (items || []).filter(row => Number.isFinite(row.price));
  if (!tokens.length) return valid[0] || null;
  return valid.find(row => {
    const text = [row.type, row.market, row.item, row.unit].join(' ').toLowerCase();
    return tokens.some(token => text.includes(String(token).toLowerCase()));
  }) || null;
}

function addMissingPriceTypes(items, item, date, requestedType) {
  const wanted = requestedType ? [requestedType] : ['retail', 'middleman', 'auction', 'eco'];
  const existing = new Set(items.map(row => row.type));
  const rows = [...items];
  for (const type of wanted) {
    if (!existing.has(type)) rows.push(priceTypeFallback(type, item, date));
  }
  return rows.sort((a, b) => priceTypeOrder(a.type) - priceTypeOrder(b.type));
}

function dedupeByType(items) {
  const seen = new Set();
  return items.filter(item => {
    if (seen.has(item.type)) return false;
    seen.add(item.type);
    return true;
  });
}

function priceTypeFallback(type, item, date) {
  return {
    type,
    label: priceTypeLabel(type),
    itemName: item,
    unit: type === 'eco' ? '품목별 단위 확인' : '단위 확인',
    price: null,
    date,
    source: type === 'auction' ? 'aT 공영도매시장 경매정보' : type === 'eco' ? 'KAMIS/공공데이터' : 'KAMIS',
    fallback: true,
    notice: typeNotice(type)
  };
}

function priceSummaryFallback(item, date, requestedType) {
  const types = requestedType ? [requestedType] : ['retail', 'middleman', 'auction', 'eco'];
  return {
    ok: false,
    item,
    source: 'KAMIS/aT',
    fallback: true,
    items: types.map(type => priceTypeFallback(type, item, date)),
    notice: '시세 데이터를 불러오지 못했습니다. 공식 정보를 함께 확인하세요.'
  };
}

function priceTrendFallback(item, type, period, date) {
  return {
    ok: false,
    item,
    type,
    period,
    source: type === 'auction' ? 'aT 공영도매시장 경매정보' : 'KAMIS',
    fallback: true,
    points: [],
    summary: { latest: null, min: null, max: null, avg: null, changeFromPrevious: null, changeRateFromPrevious: null },
    notice: `${typeNotice(type)} 기간별 가격 동향 API는 공식 파라미터 확인 후 연결할 예정입니다.`,
    error: type === 'auction' ? 'auction_endpoint_pending' : 'period_api_pending'
  };
}

function priceTypeLabel(type) {
  return ({
    retail: '소매가격',
    middleman: '중도매인 판매가격',
    auction: '도매가격·경락가격',
    eco: '친환경 소매가격'
  })[type] || '시세';
}

function typeNotice(type) {
  return ({
    retail: '소비자 구입 가격 흐름을 참고합니다.',
    middleman: '도매시장 중도매인 판매가격으로, 경락가격과 다를 수 있습니다.',
    auction: '공영도매시장 경락가격 참고자료입니다.',
    eco: '조사주기와 품목 범위가 일반 시세와 다를 수 있습니다.'
  })[type] || SAFE_MARKET_NOTICE;
}

function priceTypeOrder(type) {
  return ({ retail: 1, middleman: 2, auction: 3, eco: 4 })[type] || 99;
}

function makeTrendPoints(latest, period, date, seedText) {
  const count = ({ '7d': 7, '30d': 30, '90d': 90, '1y': 12 })[period] || 30;
  const stepDays = period === '1y' ? 30 : 1;
  const seed = hashNumber(seedText);
  const base = Number(latest);
  const end = parseCompactDate(date);
  return Array.from({ length: count }, (_, index) => {
    const reverse = count - index - 1;
    const d = new Date(end.getTime() - reverse * stepDays * 86400000);
    const wave = Math.sin((index + seed % 11) / 3) * 0.045;
    const drift = ((index - count + 1) / Math.max(1, count)) * 0.035;
    const price = Math.max(1, Math.round(base * (1 + wave + drift)));
    return { date: formatCompactDate(d), price };
  });
}

function summarizeTrend(points) {
  const prices = points.map(point => point.price).filter(Number.isFinite);
  if (!prices.length) return { latest: null, min: null, max: null, avg: null, changeFromPrevious: null, changeRateFromPrevious: null };
  const latest = prices[prices.length - 1];
  const previous = prices.length > 1 ? prices[prices.length - 2] : null;
  const change = previous === null ? null : latest - previous;
  return {
    latest,
    min: Math.min(...prices),
    max: Math.max(...prices),
    avg: Math.round(prices.reduce((sum, value) => sum + value, 0) / prices.length),
    changeFromPrevious: change,
    changeRateFromPrevious: previous ? Math.round((change / previous) * 1000) / 10 : null
  };
}

function hashNumber(text) {
  return String(text || '').split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
}

function parseCompactDate(value) {
  const text = String(value || todayKst()).replace(/[^\d]/g, '');
  if (text.length >= 8) return new Date(Date.UTC(Number(text.slice(0, 4)), Number(text.slice(4, 6)) - 1, Number(text.slice(6, 8))));
  return new Date();
}

function formatCompactDate(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
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

function nongsaroFallback(error, service = '', operation = '') {
  return {
    ok: false,
    source: 'NONGSARO',
    service,
    operation,
    fallback: true,
    error,
    items: [],
    notice: '농사로 공공정보를 불러오지 못했습니다. 공식 제공처에서 작물명과 항목을 다시 확인해주세요.'
  };
}

function psisFallback(error, crop, keyword) {
  return {
    ok: false,
    source: 'PSIS',
    fallback: true,
    error,
    crop,
    keyword,
    items: [{
      title: 'PSIS 안전사용기준 확인',
      summary: '농약 사용 전 등록 작물, 대상, 사용시기, 희석배수, 안전사용기준을 농약안전정보시스템에서 확인하세요.',
      officialUrl: 'https://psis.rda.go.kr/'
    }],
    notice: '농약안전정보시스템 공식 정보를 함께 확인하세요.'
  };
}

function mafraFacilityFallback(error) {
  return {
    ok: false,
    source: 'MAFRA',
    dataset: '시설채소 생산실적',
    fallback: true,
    error,
    message: '시설채소 생산실적 API 상세 정보 확인 또는 연동이 필요합니다.',
    notice: '실제 수익성이나 출하가격을 의미하지 않는 통계 참고자료입니다.'
  };
}

function mafraFlowerFallback(error) {
  return {
    ok: false,
    source: 'MAFRA',
    dataset: '화훼류 시세현황',
    fallback: true,
    error,
    message: '화훼류 시세현황 API 상세 정보 확인 또는 연동이 필요합니다.',
    notice: '화훼류 시세는 시장 흐름 참고자료입니다.'
  };
}

function normalizeMafraFacilityItems(payload, filters) {
  const raw = firstArray(
    payload?.[MAFRA_FACILITY_VEGETABLE_API]?.row,
    payload?.Grid_20141222000000000136_1?.row,
    payload?.row,
    payload?.items
  );
  return raw.map(row => ({
    item: pick(row, ['PRDLST', 'item'], filters.item || ''),
    region: pick(row, ['AREA_SE', 'region'], filters.region || ''),
    year: pick(row, ['EXAMIN_YEAR', 'year'], filters.year || ''),
    area: pick(row, ['FCLTY_CTVT_AR'], ''),
    production: pick(row, ['FCLTY_PRDCTN_QY'], ''),
    yield: pick(row, ['FCLTY_UNIT_AR_PRDCTN_QY'], ''),
    unit: '면적 ha, 생산량 톤, 단수 kg',
    source: '농림축산식품 공공데이터 포털'
  })).filter(row => row.item || row.region || row.year);
}

async function safePublicSection(source, loader, key = true) {
  if (!key) return { source, fallback: true, items: [] };
  try {
    const items = await loader();
    return { source, fallback: !items.length, items };
  } catch {
    return { source, fallback: true, items: [] };
  }
}

function publicSection(title, source, result, fallbackSummary, officialUrl) {
  return {
    title,
    source,
    fallback: result.fallback,
    items: result.items.length ? result.items : [{
      title,
      summary: fallbackSummary,
      officialUrl
    }]
  };
}

function normalizePublicItems(items, titleFallback, summaryFallback, officialUrl) {
  return items.slice(0, 3).map(item => ({
    title: item.title || titleFallback,
    summary: compactSentence(item.summary || summaryFallback),
    officialUrl: item.officialUrl || officialUrl
  }));
}

function weatherFallback(error, region, city, displayName, base = kmaBaseDateTime()) {
  return {
    ok: false,
    source: 'KMA',
    fallback: true,
    error,
    region,
    city,
    displayName,
    baseDate: base.baseDate,
    baseTime: base.baseTime,
    items: null,
    notice: '시제품 참고 데이터입니다. 실제 작업 여부는 현장 상황과 공식 정보를 함께 확인하세요.'
  };
}

function normalizeKmaItems(payload, base) {
  const raw = firstArray(
    payload?.response?.body?.items?.item,
    payload?.body?.items?.item,
    payload?.items?.item,
    payload?.items
  );
  if (!raw.length) throw new Error('kma_empty_items');

  const now = kstParts();
  const targetStamp = `${now.date}${now.hour}${now.minute}`;
  const sorted = raw
    .map(item => ({
      category: String(item.category || ''),
      value: item.fcstValue,
      fcstDate: String(item.fcstDate || base.baseDate),
      fcstTime: String(item.fcstTime || '0000').padStart(4, '0')
    }))
    .filter(item => item.category)
    .sort((a, b) => `${a.fcstDate}${a.fcstTime}`.localeCompare(`${b.fcstDate}${b.fcstTime}`));

  const nearest = {};
  const daily = {};
  for (const item of sorted) {
    const stamp = `${item.fcstDate}${item.fcstTime}`;
    const isFuture = stamp >= targetStamp;
    if (isFuture && nearest[item.category] === undefined) nearest[item.category] = item.value;
    if (item.fcstDate === now.date && daily[item.category] === undefined) daily[item.category] = item.value;
  }
  for (const item of sorted) {
    if (nearest[item.category] === undefined) nearest[item.category] = item.value;
  }

  const minTemp = toNullableNumber(daily.TMN ?? nearest.TMN);
  const maxTemp = toNullableNumber(daily.TMX ?? nearest.TMX);
  return {
    temperature: toNullableNumber(nearest.TMP),
    minTemp,
    maxTemp,
    rainProbability: toNullableNumber(nearest.POP),
    rainAmount: normalizeRainAmount(nearest.PCP),
    humidity: toNullableNumber(nearest.REH),
    windSpeed: toNullableNumber(nearest.WSD),
    sky: skyText(nearest.SKY),
    precipitationType: precipitationText(nearest.PTY),
    dailyTempRange: Number.isFinite(minTemp) && Number.isFinite(maxTemp)
      ? Math.round((maxTemp - minTemp) * 10) / 10
      : null
  };
}

function kmaBaseDateTime() {
  const parts = kstParts(new Date(Date.now() - 60 * 60 * 1000));
  const baseTimes = ['0200', '0500', '0800', '1100', '1400', '1700', '2000', '2300'];
  const currentHHMM = `${parts.hour}${parts.minute}`;
  const baseTime = [...baseTimes].reverse().find(time => time <= currentHHMM);
  if (baseTime) return { baseDate: parts.date, baseTime };

  const previous = kstParts(new Date(Date.now() - 25 * 60 * 60 * 1000));
  return { baseDate: previous.date, baseTime: '2300' };
}

function kstParts(date = new Date()) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return {
    date: `${kst.getUTCFullYear()}${String(kst.getUTCMonth() + 1).padStart(2, '0')}${String(kst.getUTCDate()).padStart(2, '0')}`,
    hour: String(kst.getUTCHours()).padStart(2, '0'),
    minute: String(kst.getUTCMinutes()).padStart(2, '0')
  };
}

function skyText(value) {
  return ({ 1: '맑음', 3: '구름 많음', 4: '흐림' })[Number(value)] || '확인 필요';
}

function precipitationText(value) {
  return ({ 0: '없음', 1: '비', 2: '비/눈', 3: '눈', 4: '소나기' })[Number(value)] || '확인 필요';
}

function normalizeRainAmount(value) {
  const text = String(value ?? '').trim();
  if (!text || text === '강수없음') return 0;
  const number = toNullableNumber(text);
  return number === null ? text : number;
}

function appendServiceKey(apiUrl, serviceKey) {
  const key = String(serviceKey || '').trim();
  if (/%[0-9A-Fa-f]{2}/.test(key)) {
    apiUrl.search = `${apiUrl.search}&serviceKey=${key}`;
    return;
  }
  apiUrl.searchParams.set('serviceKey', key);
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

function normalizeNongsaroItems(text) {
  const xml = String(text || '');
  const itemXml = xml.match(/<item[^>]*>[\s\S]*?<\/item>/gi) || [];
  if (itemXml.length) {
    return itemXml.map(item => {
      const title = firstText(
        xmlTag(item, 'sj'),
        xmlTag(item, 'title'),
        xmlTag(item, 'cntntsSj'),
        xmlTag(item, 'subject'),
        xmlTag(item, 'fileName'),
        xmlTag(item, 'mainCategoryNm'),
        xmlTag(item, 'subCategoryNm'),
        xmlTag(item, 'cropNm'),
        xmlTag(item, 'prdlstNm')
      );
      const summary = firstText(
        xmlTag(item, 'cn'),
        xmlTag(item, 'contents'),
        xmlTag(item, 'summary'),
        xmlTag(item, 'rm'),
        xmlTag(item, 'writer'),
        xmlTag(item, 'registDt')
      );
      const url = firstText(
        xmlTag(item, 'url'),
        xmlTag(item, 'linkUrl'),
        xmlTag(item, 'fileUrl'),
        xmlTag(item, 'downUrl')
      );
      return {
        title: compactSentence(title || stripHtml(item)),
        summary: compactSentence(summary || stripHtml(item)),
        officialUrl: normalizeOfficialUrl(url, 'https://www.nongsaro.go.kr/')
      };
    }).filter(item => item.title).slice(0, 12);
  }

  const htmlRows = xml.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  return htmlRows.map(row => {
    const text = compactSentence(stripHtml(row));
    return {
      title: text,
      summary: text,
      officialUrl: 'https://www.nongsaro.go.kr/'
    };
  }).filter(item => item.title).slice(0, 12);
}

function normalizePsisXmlItems(text) {
  return (String(text).match(/<item[^>]*>[\s\S]*?<\/item>/gi) || []).map(item => ({
    title: firstText(
      xmlTag(item, 'pestiKorName'),
      xmlTag(item, 'pestiBrandName'),
      xmlTag(item, 'prdlstNm'),
      xmlTag(item, 'cropName'),
      xmlTag(item, 'dbyhsNm'),
      'PSIS 안전사용기준'
    ),
    crop: firstText(xmlTag(item, 'cropName'), xmlTag(item, 'prdlstNm')),
    target: firstText(xmlTag(item, 'diseaseWeedName'), xmlTag(item, 'dbyhsNm'), xmlTag(item, 'dissCl')),
    useTiming: firstText(xmlTag(item, 'useSuittime'), xmlTag(item, 'useTime'), xmlTag(item, 'useBeforeHarvest')),
    dilution: firstText(xmlTag(item, 'dilutUnit'), xmlTag(item, 'dilut')),
    summary: compactSentence(firstText(
      xmlTag(item, 'safeUseStdr'),
      xmlTag(item, 'useSuittime'),
      xmlTag(item, 'useNum'),
      xmlTag(item, 'dilutUnit'),
      stripHtml(item)
    )),
    officialUrl: 'https://psis.rda.go.kr/'
  })).filter(item => item.title).slice(0, 12);
}

function normalizePsisItems(items, crop, keyword) {
  return items
    .filter(item => !crop || matchesText([item.title, item.crop, item.summary].join(' '), crop) || !item.crop)
    .map(item => ({
      title: item.title || 'PSIS 안전사용기준',
      summary: item.summary || '등록 작물, 대상, 사용시기, 희석배수, 안전사용기준을 공식 정보에서 확인하세요.',
      officialUrl: item.officialUrl || 'https://psis.rda.go.kr/'
    }))
    .slice(0, 6);
}

function isOpenApiError(text) {
  const code = xmlTag(text, 'resultCode');
  return Boolean(code && !['00', '0', 'SUCCESS'].includes(String(code).toUpperCase()));
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

function firstText(...values) {
  return values.map(value => String(value || '').trim()).find(Boolean) || '';
}

function compactSentence(value, max = 120) {
  const text = stripHtml(value).replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function normalizeOfficialUrl(value, fallback) {
  const text = String(value || '').trim();
  if (!text) return fallback;
  if (/^https?:\/\//i.test(text)) return text;
  if (text.startsWith('/')) return `https://www.nongsaro.go.kr${text}`;
  return fallback;
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

function cleanYear(value) {
  const text = String(value || '').trim();
  return /^\d{4}$/.test(text) ? text : '';
}

function cleanGrid(value) {
  const text = String(value ?? '').trim();
  return /^\d{1,3}$/.test(text) ? text : '';
}

function cleanToken(value) {
  const text = String(value || '').trim();
  return /^[A-Za-z0-9_-]{1,40}$/.test(text) ? text : '';
}

function todayKst() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, '0')}-${String(kst.getUTCDate()).padStart(2, '0')}`;
}

'use strict';

export const PROVIDER_STATUS = Object.freeze({
  LIVE: 'LIVE',
  STALE: 'STALE',
  FALLBACK: 'FALLBACK',
  UNAVAILABLE: 'UNAVAILABLE'
});

export const PROVIDER_CONFIG = Object.freeze({
  kma: providerConfig('KMA', 'weather', '기상청 단기예보', 'https://www.weather.go.kr/', 8000, 900, 6),
  kamis: providerConfig('KAMIS', 'market', 'KAMIS 농산물 시세', 'https://www.kamis.or.kr/', 8000, 900, 72),
  ncpms: providerConfig('NCPMS', 'pestDisease', '국가농작물병해충관리시스템', 'https://ncpms.rda.go.kr/', 12000, 21600, null, 'reference'),
  psis: providerConfig('PSIS', 'pesticideSafety', '농약안전정보시스템', 'https://psis.rda.go.kr/', 10000, 21600, null, 'reference'),
  nongsaro: providerConfig('NONGSARO', 'cultivation', '농사로 농업기술정보', 'https://www.nongsaro.go.kr/', 8000, 43200, null, 'reference'),
  mafra: providerConfig('MAFRA', 'cultivation', '농림축산식품 공공데이터', 'https://data.mafra.go.kr/', 8000, 21600, 8760),
  auction: providerConfig('AUCTION', 'market', '공영도매시장 경매정보', 'https://at.agromarket.kr/', 8000, 900, 72)
});

const PROVIDER_ORDER = Object.freeze(['kma', 'kamis', 'ncpms', 'psis', 'nongsaro', 'mafra', 'auction']);
const SECTION_NAMES = Object.freeze(['weather', 'pestDisease', 'pesticideSafety', 'market', 'cultivation', 'support']);

function providerConfig(provider, category, source, sourceUrl, timeoutMs, cacheTtlSeconds, maxAgeHours, freshnessMode = 'dated') {
  return Object.freeze({ provider, category, source, sourceUrl, timeoutMs, cacheTtlSeconds, maxAgeHours, freshnessMode });
}

export function providerCacheControl(providerKey) {
  const seconds = getProviderConfig(providerKey).cacheTtlSeconds;
  return `public, max-age=${Math.min(seconds, 300)}, s-maxage=${seconds}`;
}

export async function fetchProvider(providerKey, input, init = {}, fetchImpl = globalThis.fetch) {
  const config = getProviderConfig(providerKey);
  if (typeof fetchImpl !== 'function') throw providerError(providerKey, 'fetch_unavailable');

  const controller = new AbortController();
  const upstreamSignal = init.signal;
  const abortFromUpstream = () => controller.abort(upstreamSignal?.reason);
  if (upstreamSignal) {
    if (upstreamSignal.aborted) abortFromUpstream();
    else upstreamSignal.addEventListener('abort', abortFromUpstream, { once: true });
  }

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(`provider_timeout_${providerKey}`);
  }, config.timeoutMs);

  try {
    return await fetchImpl(input, {
      ...init,
      signal: controller.signal,
      cf: {
        ...(init.cf || {}),
        cacheTtl: config.cacheTtlSeconds,
        cacheEverything: true
      }
    });
  } catch (error) {
    if (timedOut || error?.name === 'AbortError') throw providerError(providerKey, 'timeout', error);
    throw error;
  } finally {
    clearTimeout(timer);
    upstreamSignal?.removeEventListener?.('abort', abortFromUpstream);
  }
}

export function providerErrorCode(providerKey, error, fallback = 'request_failed') {
  const provider = getProviderConfig(providerKey).provider.toLowerCase();
  const explicit = String(error?.code || '').trim().toLowerCase();
  if (explicit) return explicit.startsWith(`${provider}_`) ? explicit : `${provider}_${explicit}`;
  const message = String(error?.message || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_');
  if (message.includes('timeout')) return `${provider}_timeout`;
  if (message && message.length <= 80) return message.startsWith(`${provider}_`) ? message : `${provider}_${message}`;
  return `${provider}_${fallback}`;
}

export function buildProviderResult(providerKey, input = {}, generatedAt = new Date().toISOString()) {
  const config = getProviderConfig(providerKey);
  const checkedAt = parseDate(generatedAt) || new Date();
  const fetchedAt = validIso(input.fetchedAt) || validIso(generatedAt) || new Date().toISOString();
  const isFallback = Boolean(input.isFallback ?? input.fallback);
  const rawItems = Array.isArray(input.items) ? input.items : [];
  const rootDataDate = normalizeDataDate(input.dataDate || input.sourceDate || input.updatedAt || '');
  const rootPublishedAt = normalizeTimestamp(input.publishedAt || '');
  const rootFreshness = assessFreshness(providerKey, rootPublishedAt || rootDataDate, fetchedAt, checkedAt);

  const items = rawItems.map((item, index) => {
    const dataDate = normalizeDataDate(item?.dataDate || item?.sourceDate || item?.date || rootDataDate);
    const publishedAt = normalizeTimestamp(item?.publishedAt || rootPublishedAt);
    const freshness = assessFreshness(providerKey, publishedAt || dataDate, fetchedAt, checkedAt);
    const itemFallback = Boolean(item?.isFallback ?? item?.fallback ?? isFallback);
    const status = statusFor({ isFallback: itemFallback, hasData: hasMeaningfulItem(item), freshness, errorCode: input.errorCode });
    return commonFields(config, {
      status,
      title: item?.title || item?.name || item?.itemName || item?.item || `${config.source} 자료 ${index + 1}`,
      summary: item?.summary || item?.memo || input.summary || defaultSummary(config, status),
      dataDate,
      publishedAt,
      fetchedAt,
      source: item?.source || input.source || config.source,
      sourceUrl: item?.sourceUrl || item?.officialUrl || input.sourceUrl || config.sourceUrl,
      freshness,
      isFallback: itemFallback,
      errorCode: cleanErrorCode(item?.errorCode || input.errorCode),
      extra: item?.extra || extractExtra(item)
    });
  });

  const status = providerStatus(items, { isFallback, freshness: rootFreshness, errorCode: input.errorCode });
  const dataDate = rootDataDate || newestDate(items.map(item => item.dataDate));
  const publishedAt = rootPublishedAt || newestDate(items.map(item => item.publishedAt));
  const freshness = assessFreshness(providerKey, publishedAt || dataDate, fetchedAt, checkedAt);
  return {
    ...commonFields(config, {
      status,
      title: input.title || config.source,
      summary: input.summary || defaultSummary(config, status),
      dataDate,
      publishedAt,
      fetchedAt,
      source: input.source || config.source,
      sourceUrl: input.sourceUrl || config.sourceUrl,
      freshness,
      isFallback,
      errorCode: cleanErrorCode(input.errorCode),
      extra: undefined
    }),
    notice: freshnessNotice(status, dataDate),
    items
  };
}

export function buildAgriFeed(providerInputs = {}, generatedAt = new Date().toISOString()) {
  const providers = Object.fromEntries(PROVIDER_ORDER.map(key => [key, buildProviderResult(key, providerInputs[key], generatedAt)]));
  const sections = Object.fromEntries(SECTION_NAMES.map(section => [section, []]));
  for (const provider of Object.values(providers)) {
    if (!sections[provider.category]) sections[provider.category] = [];
    sections[provider.category].push(...provider.items);
  }

  const statuses = Object.values(providers).map(provider => provider.status);
  const overallStatus = statuses.includes(PROVIDER_STATUS.LIVE)
    ? PROVIDER_STATUS.LIVE
    : statuses.includes(PROVIDER_STATUS.STALE)
      ? PROVIDER_STATUS.STALE
      : statuses.includes(PROVIDER_STATUS.FALLBACK)
        ? PROVIDER_STATUS.FALLBACK
        : PROVIDER_STATUS.UNAVAILABLE;

  return {
    generatedAt,
    overallStatus,
    partial: new Set(statuses).size > 1,
    sections,
    providers
  };
}

export function assessFreshness(providerKey, value, fetchedAt = new Date().toISOString(), now = new Date()) {
  const config = getProviderConfig(providerKey);
  const parsed = parseDate(value);
  if (!parsed) {
    return {
      state: config.freshnessMode === 'reference' ? 'REFERENCE' : 'UNKNOWN',
      ageHours: null,
      maxAgeHours: config.maxAgeHours,
      checkedAt: validIso(fetchedAt) || now.toISOString()
    };
  }

  const ageHours = Math.max(0, Math.round(((now.getTime() - parsed.getTime()) / 3600000) * 10) / 10);
  const state = config.freshnessMode === 'historical'
    ? 'HISTORICAL'
    : config.maxAgeHours !== null && ageHours > config.maxAgeHours
      ? 'STALE'
      : 'FRESH';
  return { state, ageHours, maxAgeHours: config.maxAgeHours, checkedAt: validIso(fetchedAt) || now.toISOString() };
}

function commonFields(config, value) {
  const result = {
    provider: config.provider,
    category: config.category,
    status: value.status,
    title: String(value.title || ''),
    summary: String(value.summary || ''),
    dataDate: value.dataDate || null,
    publishedAt: value.publishedAt || null,
    fetchedAt: value.fetchedAt,
    source: String(value.source || config.source),
    sourceUrl: safeSourceUrl(value.sourceUrl, config.sourceUrl),
    freshness: value.freshness,
    isFallback: Boolean(value.isFallback),
    errorCode: value.errorCode || null
  };
  if (value.extra && Object.keys(value.extra).length) result.extra = value.extra;
  return result;
}

function providerStatus(items, root) {
  if (items.some(item => item.status === PROVIDER_STATUS.LIVE)) return PROVIDER_STATUS.LIVE;
  if (items.some(item => item.status === PROVIDER_STATUS.STALE)) return PROVIDER_STATUS.STALE;
  if (root.isFallback && items.length) return PROVIDER_STATUS.FALLBACK;
  if (items.some(item => item.status === PROVIDER_STATUS.FALLBACK)) return PROVIDER_STATUS.FALLBACK;
  if (!root.isFallback && !root.errorCode && root.freshness.state === 'FRESH') return PROVIDER_STATUS.LIVE;
  return PROVIDER_STATUS.UNAVAILABLE;
}

function statusFor({ isFallback, hasData, freshness, errorCode }) {
  if (isFallback) return hasData ? PROVIDER_STATUS.FALLBACK : PROVIDER_STATUS.UNAVAILABLE;
  if (errorCode && !hasData) return PROVIDER_STATUS.UNAVAILABLE;
  if (freshness.state === 'STALE' || freshness.state === 'HISTORICAL') return PROVIDER_STATUS.STALE;
  return hasData ? PROVIDER_STATUS.LIVE : PROVIDER_STATUS.UNAVAILABLE;
}

function freshnessNotice(status, dataDate) {
  if (status === PROVIDER_STATUS.FALLBACK) {
    return dataDate
      ? `현재 최신 데이터를 불러오지 못해 ${dataDate} 기준 자료를 표시하고 있습니다.`
      : '현재 최신 데이터를 불러오지 못했습니다. 공식 제공처를 확인해주세요.';
  }
  if (status === PROVIDER_STATUS.STALE) return `${dataDate || '날짜 확인 필요'} 기준 자료입니다. 최신 공표 여부를 공식 제공처에서 확인해주세요.`;
  if (status === PROVIDER_STATUS.UNAVAILABLE) return '현재 데이터를 불러오지 못했습니다. 공식 제공처를 확인해주세요.';
  return dataDate ? `${dataDate} 기준 공식 자료입니다.` : '공식 제공처에서 조회한 참고자료입니다.';
}

function defaultSummary(config, status) {
  if (status === PROVIDER_STATUS.UNAVAILABLE) return `${config.source} 자료를 현재 불러오지 못했습니다.`;
  return `${config.source}에서 확인한 참고자료입니다.`;
}

function extractExtra(item) {
  if (!item || typeof item !== 'object') return {};
  const reserved = new Set(['provider', 'category', 'status', 'title', 'name', 'summary', 'dataDate', 'sourceDate', 'date', 'publishedAt', 'fetchedAt', 'source', 'sourceUrl', 'officialUrl', 'freshness', 'isFallback', 'fallback', 'errorCode', 'extra']);
  return Object.fromEntries(Object.entries(item).filter(([key, value]) => !reserved.has(key) && value !== undefined));
}

function hasMeaningfulItem(item) {
  if (!item || typeof item !== 'object') return false;
  return Boolean(item.title || item.name || item.item || item.itemName || item.summary || item.memo || item.price !== undefined);
}

function normalizeDataDate(value) {
  const text = String(value || '').trim();
  if (/^\d{8}$/.test(text)) return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  if (/^\d{4}$/.test(text)) return `${text}-01-01`;
  return '';
}

function normalizeTimestamp(value) {
  const parsed = parseDate(value);
  return parsed ? parsed.toISOString() : null;
}

function parseDate(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const normalized = /^\d{8}$/.test(text) ? `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}T00:00:00Z`
    : /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00Z`
      : /^\d{4}$/.test(text) ? `${text}-01-01T00:00:00Z`
        : text;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function newestDate(values) {
  return values.filter(Boolean).sort().at(-1) || '';
}

function validIso(value) {
  const parsed = parseDate(value);
  return parsed ? parsed.toISOString() : '';
}

function cleanErrorCode(value) {
  const text = String(value || '').trim().toLowerCase();
  return /^[a-z0-9_:-]{1,100}$/.test(text) ? text : null;
}

function safeSourceUrl(value, fallback) {
  try {
    const url = new URL(String(value || fallback));
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

function providerError(providerKey, suffix, cause) {
  const error = new Error(`${providerKey}_${suffix}`, cause ? { cause } : undefined);
  error.code = `${providerKey}_${suffix}`;
  return error;
}

function getProviderConfig(providerKey) {
  const config = PROVIDER_CONFIG[providerKey];
  if (!config) throw new Error(`unknown_provider_${providerKey}`);
  return config;
}

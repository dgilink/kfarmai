import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import worker from '../src/index.js';
import {
  PROVIDER_CONFIG,
  PROVIDER_STATUS,
  assessFreshness,
  buildAgriFeed,
  buildProviderResult,
  fetchProvider
} from '../src/agri-contract.js';

const NOW = '2026-10-02T03:00:00.000Z';
const TODAY = '2026-10-02';
const COMMON_FIELDS = [
  'provider', 'category', 'status', 'title', 'summary', 'dataDate', 'publishedAt',
  'fetchedAt', 'source', 'sourceUrl', 'freshness', 'isFallback', 'errorCode'
];

test('normal response becomes LIVE', () => {
  const result = buildProviderResult('kamis', {
    dataDate: TODAY,
    fetchedAt: NOW,
    items: [{ title: '토마토 소매가격', summary: '1kg 기준', dataDate: TODAY }]
  }, NOW);
  assert.equal(result.status, PROVIDER_STATUS.LIVE);
  assert.equal(result.items[0].status, PROVIDER_STATUS.LIVE);
});

test('72-hour freshness boundary is deterministic in UTC', () => {
  const checkedAt = new Date('2026-10-05T00:00:00.000Z');
  const beforeBoundary = assessFreshness('kamis', '2026-10-02T00:01:00.000Z', NOW, checkedAt);
  const atBoundary = assessFreshness('kamis', '2026-10-02T00:00:00.000Z', NOW, checkedAt);
  const afterBoundary = assessFreshness('kamis', '2026-10-01T23:54:00.000Z', NOW, checkedAt);
  const future = assessFreshness('kamis', '2026-10-05T01:00:00.000Z', NOW, checkedAt);
  const invalid = assessFreshness('kamis', 'not-a-date', NOW, checkedAt);
  const offsetBoundary = assessFreshness('kamis', '2026-10-02T09:00:00+09:00', NOW, checkedAt);

  assert.equal(beforeBoundary.state, 'FRESH');
  assert.equal(atBoundary.state, 'FRESH');
  assert.equal(atBoundary.ageHours, 72);
  assert.equal(afterBoundary.state, 'STALE');
  assert.equal(afterBoundary.ageHours, 72.1);
  assert.equal(future.state, 'FRESH');
  assert.equal(future.ageHours, 0);
  assert.equal(invalid.state, 'UNKNOWN');
  assert.equal(invalid.ageHours, null);
  assert.equal(offsetBoundary.state, 'FRESH');
  assert.equal(offsetBoundary.ageHours, 72);
});

test('provider timeout is classified and cannot wait forever', async () => {
  const abort = new DOMException('aborted fixture', 'AbortError');
  await assert.rejects(
    fetchProvider('ncpms', 'https://fixture.invalid', {}, async () => { throw abort; }),
    error => error.code === 'ncpms_timeout'
  );
  assert.equal(PROVIDER_CONFIG.ncpms.timeoutMs, 12000);
});

test('HTTP error becomes KAMIS fallback without failing agri-feed', async () => {
  await withFetch(async () => new Response('upstream error', { status: 503 }), async () => {
    const feed = await requestFeed({ KAMIS_API_KEY: 'fixture', KAMIS_API_ID: 'fixture' });
    assert.equal(feed.providers.kamis.status, PROVIDER_STATUS.FALLBACK);
    assert.equal(feed.providers.kamis.errorCode, 'kamis_http_error');
  });
});

test('malformed JSON or XML becomes a labeled fallback', async () => {
  await withFetch(async () => new Response('not-json-or-xml', { status: 200 }), async () => {
    const feed = await requestFeed({ KAMIS_API_KEY: 'fixture', KAMIS_API_ID: 'fixture' });
    assert.equal(feed.providers.kamis.status, PROVIDER_STATUS.FALLBACK);
    assert.equal(feed.providers.kamis.errorCode, 'kamis_empty_items');
    assert.match(feed.providers.kamis.notice, /2026-07-02 기준/);
  });
});

test('empty provider data does not become LIVE', () => {
  const result = buildProviderResult('ncpms', { fetchedAt: NOW, items: [] }, NOW);
  assert.equal(result.status, PROVIDER_STATUS.UNAVAILABLE);
});

test('old non-fallback data becomes STALE', () => {
  const result = buildProviderResult('kamis', {
    dataDate: '2020-01-01',
    fetchedAt: NOW,
    items: [{ title: '과거 시세', summary: '과거 자료', dataDate: '2020-01-01' }]
  }, NOW);
  assert.equal(result.status, PROVIDER_STATUS.STALE);
  assert.equal(result.freshness.state, 'STALE');
});

test('fallback preserves source date and explicit freshness notice', () => {
  const result = buildProviderResult('kamis', {
    isFallback: true,
    dataDate: '2026-07-02',
    fetchedAt: NOW,
    items: [{ title: '저장 시세', summary: '저장 자료', dataDate: '2026-07-02', isFallback: true }]
  }, NOW);
  assert.equal(result.status, PROVIDER_STATUS.FALLBACK);
  assert.equal(result.dataDate, '2026-07-02');
  assert.match(result.notice, /현재 최신 데이터를 불러오지 못해 2026-07-02 기준/);
});

test('partial provider success returns overall LIVE', async context => {
  context.mock.timers.enable({ apis: ['Date'], now: new Date(NOW) });
  try {
    const fixture = {
      price: [{ productName: '토마토', product_cls_name: '소매', lastest_day: TODAY, unit: '1kg', dpr1: '5200' }]
    };
    await withFetch(async () => Response.json(fixture), async () => {
      const feed = await requestFeed({ KAMIS_API_KEY: 'fixture', KAMIS_API_ID: 'fixture' });
      assert.equal(feed.overallStatus, PROVIDER_STATUS.LIVE);
      assert.equal(feed.partial, true);
      assert.equal(feed.providers.kamis.status, PROVIDER_STATUS.LIVE);
      assert.equal(feed.providers.ncpms.status, PROVIDER_STATUS.UNAVAILABLE);
    });
  } finally {
    context.mock.timers.reset();
  }
});

test('KMA fixture is normalized with forecast base date', async () => {
  const fixture = {
    response: {
      header: { resultCode: '00' },
      body: { items: { item: [
        { category: 'TMP', fcstDate: '20261002', fcstTime: '1200', fcstValue: '23' },
        { category: 'POP', fcstDate: '20261002', fcstTime: '1200', fcstValue: '30' },
        { category: 'REH', fcstDate: '20261002', fcstTime: '1200', fcstValue: '70' }
      ] } }
    }
  };
  await withFetch(async () => Response.json(fixture), async () => {
    const feed = await requestFeedUrl({ KMA_SERVICE_KEY: 'fixture' }, 'https://kfarmai.test/api/agri-feed?nx=60&ny=127');
    assert.equal(feed.providers.kma.status, PROVIDER_STATUS.LIVE);
    assert.match(feed.providers.kma.dataDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(feed.providers.kma.publishedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/);
  });
});

test('NCPMS XML list and detail fixtures are normalized', async () => {
  await withFetch(async input => {
    const url = new URL(input);
    if (url.searchParams.get('serviceCode') === 'SVC05') {
      return new Response('<service><cropName>고추</cropName><sickNameKor>탄저병</sickNameKor><symptoms>열매 반점</symptoms></service>');
    }
    return new Response('<service><items><item><sickKey>A1</sickKey><cropName>고추</cropName><sickNameKor>탄저병</sickNameKor></item></items></service>');
  }, async () => {
    const feed = await requestFeedUrl({ NCPMS_API_KEY: 'fixture' }, 'https://kfarmai.test/api/agri-feed?crop=고추');
    assert.equal(feed.providers.ncpms.status, PROVIDER_STATUS.LIVE);
    assert.equal(feed.providers.ncpms.items[0].title, '탄저병');
  });
});

test('PSIS fixture uses only the dedicated compatible credential path', async () => {
  const xml = '<service><items><item><pestiKorName>안전사용기준</pestiKorName><cropName>고추</cropName><safeUseStdr>등록 작물과 사용시기 확인</safeUseStdr></item></items></service>';
  await withFetch(async () => new Response(xml), async () => {
    const feed = await requestFeedUrl({ PSIS_API_KEY: 'fixture' }, 'https://kfarmai.test/api/agri-feed?crop=고추');
    assert.equal(feed.providers.psis.status, PROVIDER_STATUS.LIVE);
    assert.match(feed.providers.psis.items[0].summary, /등록 작물/);
  });

  await withFetch(async () => new Response('<items><item><sj>농사로 자료</sj></item></items>'), async () => {
    const feed = await requestFeedUrl({ NONGSARO_API_KEY: 'fixture' }, 'https://kfarmai.test/api/agri-feed?crop=고추');
    assert.equal(feed.providers.psis.status, PROVIDER_STATUS.FALLBACK);
    assert.equal(feed.providers.psis.errorCode, 'missing_service_key');
  });
});

test('농사로 fixture is normalized as official cultivation reference', async () => {
  const xml = '<service><items><item><sj>고추 재배기술</sj><cn>물관리와 생육 확인</cn><url>https://www.nongsaro.go.kr/</url></item></items></service>';
  await withFetch(async () => new Response(xml), async () => {
    const feed = await requestFeedUrl({ NONGSARO_API_KEY: 'fixture' }, 'https://kfarmai.test/api/agri-feed?crop=고추');
    assert.equal(feed.providers.nongsaro.status, PROVIDER_STATUS.LIVE);
    assert.equal(feed.providers.nongsaro.items[0].title, '고추 재배기술');
  });
});

test('MAFRA facility and flower fixtures keep their own data dates', async () => {
  await withFetch(async input => {
    const url = String(input);
    if (url.includes('Grid_20141222000000000136_1')) {
      return Response.json({ Grid_20141222000000000136_1: { row: [{ PRDLST: '토마토', AREA_SE: '전국', EXAMIN_YEAR: '2013', FCLTY_CTVT_AR: '1', FCLTY_PRDCTN_QY: '2' }] } });
    }
    return Response.json({ Grid_20141225000000000158_1: { row: [{ PRDLST_NM: '장미', AUC_DE: '20261002', CATGORY_NM: '절화', AVRG_AMT: '1500' }] } });
  }, async () => {
    const feed = await requestFeedUrl({ MAFRA_SERVICE_KEY: 'fixture' }, 'https://kfarmai.test/api/agri-feed?item=장미&date=2026-10-02');
    assert.equal(feed.providers.mafra.status, PROVIDER_STATUS.LIVE);
    assert.deepEqual(feed.providers.mafra.items.map(item => item.dataDate).sort(), ['2013-01-01', '2026-10-02']);
    assert.ok(feed.providers.mafra.items.some(item => item.status === PROVIDER_STATUS.STALE));
  });
});

test('MAFRA HTTP failures remain unavailable with a specific cause', async () => {
  await withFetch(async () => new Response('unavailable', { status: 503 }), async () => {
    const feed = await requestFeedUrl({ MAFRA_SERVICE_KEY: 'fixture' }, 'https://kfarmai.test/api/agri-feed?item=장미');
    assert.equal(feed.providers.mafra.status, PROVIDER_STATUS.UNAVAILABLE);
    assert.equal(feed.providers.mafra.errorCode, 'mafra_facility_http_503');
  });
});

test('all unavailable or fallback providers still return HTTP 200 contract', async () => {
  const feed = await requestFeed({});
  assert.equal(feed.overallStatus, PROVIDER_STATUS.FALLBACK);
  assert.equal(feed.providers.kma.status, PROVIDER_STATUS.UNAVAILABLE);
  assert.equal(feed.providers.auction.status, PROVIDER_STATUS.FALLBACK);
});

test('every provider and item exposes the common date/source contract', async () => {
  const feed = buildAgriFeed({
    kma: { fetchedAt: NOW, items: [] },
    kamis: { isFallback: true, dataDate: '2026-07-02', fetchedAt: NOW, items: [{ title: '저장 시세', dataDate: '2026-07-02', isFallback: true }] },
    ncpms: { fetchedAt: NOW, items: [{ title: '병해충 정보', summary: '공식 참고' }] }
  }, NOW);
  for (const provider of Object.values(feed.providers)) {
    for (const field of COMMON_FIELDS) assert.ok(Object.hasOwn(provider, field), `${provider.provider}.${field}`);
    for (const item of provider.items) {
      for (const field of COMMON_FIELDS) assert.ok(Object.hasOwn(item, field), `${provider.provider}.item.${field}`);
    }
  }
  assert.deepEqual(Object.keys(feed.sections), ['weather', 'pestDisease', 'pesticideSafety', 'market', 'cultivation', 'support']);
});

test('provider timeout and cache TTL are centrally configured for all providers', () => {
  assert.equal(Object.keys(PROVIDER_CONFIG).length, 7);
  for (const config of Object.values(PROVIDER_CONFIG)) {
    assert.ok(config.timeoutMs >= 5000 && config.timeoutMs <= 12000);
    assert.ok(config.cacheTtlSeconds > 0);
  }
});

test('every external provider fetch is routed through the timeout wrapper', () => {
  const source = fs.readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /await\s+fetch\s*\(/);
  assert.equal((source.match(/fetchProvider\('/g) || []).length, 9);
});

test('KAMIS trend pending contract is explicitly UNAVAILABLE', async () => {
  const response = await worker.fetch(new Request('https://kfarmai.test/api/kamis/price-trend?item=토마토&period=30d'), {});
  const body = await response.json();
  assert.equal(body.status, PROVIDER_STATUS.UNAVAILABLE);
  assert.equal(body.errorCode, 'period_api_pending');
  assert.equal(body.dataDate, null);
  assert.equal(body.isFallback, true);
});

test('static weather and market fallback files expose their old source dates', () => {
  const weather = JSON.parse(fs.readFileSync(new URL('../../data/agri_weather.json', import.meta.url), 'utf8'));
  const market = JSON.parse(fs.readFileSync(new URL('../../data/market_prices.json', import.meta.url), 'utf8'));
  for (const data of [weather, market]) {
    assert.equal(data.fallback, true);
    assert.equal(data.freshness, 'STALE');
    assert.equal(data.sourceDate || data.dataDate, '2026-07-02');
    assert.match(data.notice, /2026-07-02 기준 저장 참고자료/);
  }
});

async function requestFeed(env) {
  return requestFeedUrl(env, `https://kfarmai.test/api/agri-feed?item=토마토&date=${TODAY}`);
}

async function requestFeedUrl(env, url) {
  const originalError = console.error;
  console.error = () => {};
  try {
    const response = await worker.fetch(new Request(url), env);
    assert.equal(response.status, 200);
    return response.json();
  } finally {
    console.error = originalError;
  }
}

async function withFetch(mock, callback) {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    return await callback();
  } finally {
    globalThis.fetch = original;
  }
}

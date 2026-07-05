#!/usr/bin/env node
'use strict';

const { CROPS, readEnvFiles, writeJson, stripTags, hasImageText } = require('./shared.cjs');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const NCPMS_ENDPOINT = 'http://ncpms.rda.go.kr/npmsAPI/service';
const NONGSARO_ENDPOINT = 'https://api.nongsaro.go.kr/service';

function xmlTag(xml, tag) {
  const match = String(xml).match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? stripTags(match[1].replace(/<!\\[CDATA\\[|\\]\\]>/g, '')) : '';
}

function itemCount(text) {
  return (String(text).match(/<item[^>]*>/gi) || []).length;
}

async function fetchText(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/xml,text/xml,application/json,*/*' } });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } finally {
    clearTimeout(timer);
  }
}

async function probeNcpms(apiKey, cropName) {
  if (!apiKey) {
    return { available: false, source: 'NCPMS', hasImages: false, reason: 'NCPMS_API_KEY missing' };
  }
  const url = new URL(NCPMS_ENDPOINT);
  url.searchParams.set('apiKey', apiKey);
  url.searchParams.set('serviceCode', 'SVC01');
  url.searchParams.set('serviceType', 'AA001');
  url.searchParams.set('cropName', cropName);
  url.searchParams.set('displayCount', '10');
  url.searchParams.set('startPoint', '1');
  try {
    const result = await fetchText(url);
    const available = result.ok && itemCount(result.text) > 0 && !/SERVICE_KEY_IS_NOT_REGISTERED|INVALID|ERROR/i.test(result.text);
    return {
      available,
      source: 'NCPMS',
      hasImages: available && hasImageText(result.text),
      sampleTitle: xmlTag(result.text, 'sickNameKor') || xmlTag(result.text, 'sickName') || '',
      reason: available ? '' : `NCPMS empty or HTTP ${result.status}`
    };
  } catch (error) {
    return { available: false, source: 'NCPMS', hasImages: false, reason: `NCPMS ${error.message}` };
  }
}

async function probeNongsaro(apiKey, service, operation, cropName) {
  if (!apiKey) {
    return { available: false, source: '농촌진흥청 농사로', reason: 'NONGSARO_API_KEY missing' };
  }
  const url = new URL(`${NONGSARO_ENDPOINT}/${service}/${operation}`);
  url.searchParams.set('apiKey', apiKey);
  url.searchParams.set('serviceType', 'AA001');
  url.searchParams.set('subCategoryNm', cropName);
  url.searchParams.set('cropNm', cropName);
  try {
    const result = await fetchText(url);
    const available = result.ok && itemCount(result.text) > 0 && !/SERVICE_KEY_IS_NOT_REGISTERED|INVALID|ERROR/i.test(result.text);
    return {
      available,
      source: '농촌진흥청 농사로',
      hasCalendarText: available && /(월|주|파종|정식|수확|관리|병해충|개화|착과)/.test(result.text),
      hasRegionText: available && /(중부|남부|제주|고랭지|지역|지대)/.test(result.text),
      hasFacilityText: available && /(시설|노지|하우스|육묘|재배)/.test(result.text),
      hasImages: available && hasImageText(result.text),
      reason: available ? '' : `${service}/${operation} empty or HTTP ${result.status}`
    };
  } catch (error) {
    return { available: false, source: '농촌진흥청 농사로', reason: `${service}/${operation} ${error.message}` };
  }
}

function coverageOf(row) {
  const guide = row.cropGuide.available;
  const weekly = row.weeklyFarming.available;
  const pest = row.pestDisease.available;
  const image = row.growthImages.available || row.pestDisease.hasImages;
  if (guide && weekly && pest && image) return 'FULL';
  if ((guide && pest) || (guide && weekly) || (weekly && pest)) return 'PARTIAL';
  if (guide || weekly || pest) return image ? 'PARTIAL' : 'TEXT_ONLY';
  return 'MISSING';
}

function markdown(report) {
  const lines = [
    '# kFarmAI 작물 API 커버리지 리포트',
    '',
    `생성일: ${report.generatedAt}`,
    '',
    'API 키 값은 이 리포트에 기록하지 않습니다.',
    '',
    '| 작물 | 상태 | 작목별농업기술정보 | 주간농사정보 | 병해충 | 이미지 | 메모 |',
    '|---|---|---:|---:|---:|---:|---|'
  ];
  for (const row of report.crops) {
    lines.push(`| ${row.crop} | ${row.coverage} | ${yes(row.cropGuide.available)} | ${yes(row.weeklyFarming.available)} | ${yes(row.pestDisease.available)} | ${yes(row.growthImages.available || row.pestDisease.hasImages)} | ${row.notes.replace(/\|/g, '/')} |`);
  }
  lines.push('', '## 누락 상태', '');
  for (const item of report.missingKeys) lines.push(`- ${item}`);
  lines.push('', '## 다음 작업', '', '- 농사로 작목별 농업기술정보의 정확한 서비스/오퍼레이션명을 운영 키로 재확인합니다.', '- 공식 이미지 URL은 원문 페이지, 출처명, 라이선스 확인 후 `approved`로 전환합니다.', '- `needs_review` 데이터는 사용자 화면에 노출하지 않습니다.');
  return lines.join('\n') + '\n';
}

function yes(value) {
  return value ? 'Y' : 'N';
}

async function main() {
  const env = readEnvFiles();
  const missingKeys = [];
  if (!env.NCPMS_API_KEY) missingKeys.push('NCPMS_API_KEY missing');
  if (!env.NONGSARO_API_KEY) missingKeys.push('NONGSARO_API_KEY missing');

  const crops = [];
  for (const [, cropName] of CROPS) {
    const cropGuide = await probeNongsaro(env.NONGSARO_API_KEY, 'cropEbook', 'mainCategoryList', cropName);
    const weeklyFarming = await probeNongsaro(env.NONGSARO_API_KEY, 'weekFarmInfo', 'weekFarmInfoList', cropName);
    const pestDisease = await probeNcpms(env.NCPMS_API_KEY, cropName);
    const growthImages = {
      available: Boolean(cropGuide.hasImages),
      needsManualOfficialMapping: !cropGuide.hasImages,
      source: cropGuide.hasImages ? '농촌진흥청 농사로' : ''
    };
    const row = {
      crop: cropName,
      coverage: 'MISSING',
      cropGuide: {
        available: cropGuide.available,
        source: '농촌진흥청_작목별농업기술정보',
        hasCalendarText: Boolean(cropGuide.hasCalendarText),
        hasRegionText: Boolean(cropGuide.hasRegionText),
        hasFacilityText: Boolean(cropGuide.hasFacilityText),
        reason: cropGuide.reason || ''
      },
      weeklyFarming: {
        available: weeklyFarming.available,
        source: '농촌진흥청_주간농사정보',
        reason: weeklyFarming.reason || ''
      },
      pestDisease: {
        available: pestDisease.available,
        source: 'NCPMS',
        hasImages: Boolean(pestDisease.hasImages),
        sampleTitle: pestDisease.sampleTitle || '',
        reason: pestDisease.reason || ''
      },
      growthImages,
      notes: ''
    };
    row.coverage = coverageOf(row);
    row.notes = row.coverage === 'MISSING'
      ? 'API 키 또는 작물별 응답을 확인하지 못했습니다. MVP seed 데이터는 공식 출처 확인 경로와 needs_review 상태를 유지합니다.'
      : '원문은 일부 확인됐으나 서비스형 달력/사진 매핑은 관리자 검수가 필요합니다.';
    crops.push(row);
  }

  const summary = crops.reduce((acc, row) => {
    acc[row.coverage] = (acc[row.coverage] || 0) + 1;
    return acc;
  }, {});
  const report = { generatedAt: new Date().toISOString(), summary, missingKeys, crops };
  writeJson('data/api_coverage_report.json', report);
  fs.writeFileSync(path.join(ROOT, 'data', 'api_coverage_report.md'), markdown(report), 'utf8');
  console.log(`coverage report: ${JSON.stringify(summary)}`);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

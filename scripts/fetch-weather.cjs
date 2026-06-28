#!/usr/bin/env node
'use strict';

const fs = require('fs/promises');
const path = require('path');
const { env } = process;

const BASE_URL = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0';
const SAMPLE = path.join(__dirname, '..', 'data', 'agri_weather_sample.json');
const OUT = path.join(__dirname, '..', 'data', 'agri_weather.json');
const SERVICE_KEY = env.DATA_GO_KR_SERVICE_KEY;

const REGIONS = [
  { id: 'suncheon', name: '전남 순천', nx: 70, ny: 70 },
  { id: 'naju', name: '전남 나주', nx: 56, ny: 71 },
  { id: 'haenam', name: '전남 해남', nx: 54, ny: 61 },
  { id: 'andong', name: '경북 안동', nx: 91, ny: 106 },
  { id: 'hongseong', name: '충남 홍성', nx: 55, ny: 106 }
];

const FCST_TIMES = ['0200', '0500', '0800', '1100', '1400', '1700', '2000', '2300'];

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function writeJson(file, value) {
  await fs.writeFile(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

async function ensureOutFromSample() {
  try {
    await fs.access(OUT);
  } catch {
    await writeJson(OUT, await readJson(SAMPLE));
  }
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function ymd(date) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

function pickBaseDateTime(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const hhmm = `${pad(kst.getUTCHours())}${pad(kst.getUTCMinutes())}`;
  let baseTime = [...FCST_TIMES].reverse().find(t => t <= hhmm);
  if (!baseTime) {
    kst.setUTCDate(kst.getUTCDate() - 1);
    baseTime = '2300';
  }
  return { baseDate: ymd(kst), baseTime };
}

function normalizePcp(value) {
  if (!value || value === '강수없음') return 0;
  const match = String(value).match(/[\d.]+/);
  return match ? Number(match[0]) : 0;
}

function pickLatestByCategory(items, category, fallback = '') {
  const found = [...items].reverse().find(item => item.category === category && item.fcstValue !== undefined);
  return found ? found.fcstValue : fallback;
}

function buildDay(items, date) {
  const dayItems = items.filter(item => item.fcstDate === date);
  const temp = pickLatestByCategory(dayItems, 'TMP', pickLatestByCategory(dayItems, 'T1H', ''));
  const humidity = pickLatestByCategory(dayItems, 'REH', '');
  const pop = pickLatestByCategory(dayItems, 'POP', '');
  const pcp = pickLatestByCategory(dayItems, 'PCP', '0');
  const wind = pickLatestByCategory(dayItems, 'WSD', '');
  const pty = pickLatestByCategory(dayItems, 'PTY', '0');
  const sky = pickLatestByCategory(dayItems, 'SKY', '');
  const tempNum = Number(temp);
  const humidityNum = Number(humidity);
  const windNum = Number(wind);
  const rainMm = normalizePcp(pcp);
  const spray = rainMm > 0 || Number(pop) >= 60 || windNum >= 4 ? '연기 권장' : '가능 조건 확인';
  return {
    tempC: Number.isFinite(tempNum) ? tempNum : '',
    rainProbability: pop === '' ? '' : Number(pop),
    rainMm,
    humidity: humidity === '' ? '' : Number(humidity),
    windMs: wind === '' ? '' : Number(wind),
    heat: Number.isFinite(tempNum) && tempNum >= 30 ? '주의' : '보통',
    cold: Number.isFinite(tempNum) && tempNum <= 8 ? '주의' : '낮음',
    spray,
    precipitationType: pty,
    sky
  };
}

function extractItems(json) {
  const raw = json?.response?.body?.items?.item || json?.body?.items?.item || json?.items?.item || [];
  return Array.isArray(raw) ? raw : [raw].filter(Boolean);
}

async function fetchForecast(region) {
  const { baseDate, baseTime } = pickBaseDateTime();
  const url = new URL(`${BASE_URL}/getVilageFcst`);
  url.searchParams.set('serviceKey', SERVICE_KEY);
  url.searchParams.set('dataType', 'JSON');
  url.searchParams.set('numOfRows', '1000');
  url.searchParams.set('pageNo', '1');
  url.searchParams.set('base_date', baseDate);
  url.searchParams.set('base_time', baseTime);
  url.searchParams.set('nx', region.nx);
  url.searchParams.set('ny', region.ny);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`weather HTTP ${res.status}`);
  const json = await res.json();
  const resultCode = json?.response?.header?.resultCode;
  if (resultCode && resultCode !== '00') throw new Error(json?.response?.header?.resultMsg || `weather result ${resultCode}`);
  const items = extractItems(json);
  if (!items.length) throw new Error(`weather empty items for ${region.name}`);

  const today = ymd(new Date(Date.now() + 9 * 60 * 60 * 1000));
  const tomorrowDate = new Date(Date.now() + 9 * 60 * 60 * 1000);
  tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
  const tomorrow = ymd(tomorrowDate);

  return {
    id: region.id,
    name: region.name,
    grid: { nx: region.nx, ny: region.ny },
    today: buildDay(items, today),
    tomorrow: buildDay(items, tomorrow)
  };
}

async function main() {
  await ensureOutFromSample();
  if (!SERVICE_KEY) {
    console.warn('DATA_GO_KR_SERVICE_KEY is not set. Keeping existing agri_weather.json or sample JSON.');
    return;
  }

  try {
    const regions = [];
    for (const region of REGIONS) {
      regions.push(await fetchForecast(region));
    }
    await writeJson(OUT, {
      source: '기상청_단기예보 조회서비스 기반 농작업 참고 정보',
      updatedAt: new Date().toISOString(),
      notice: '공공데이터 API 응답을 변환한 농작업 참고 정보입니다.',
      regions
    });
    console.log(`Updated ${OUT}: ${regions.length} regions`);
  } catch (err) {
    console.error(`Weather fetch failed. Keeping existing JSON. ${err.message}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});

#!/usr/bin/env node
'use strict';

const fs = require('fs/promises');
const path = require('path');
const { env } = process;

const ENDPOINT = 'https://apis.data.go.kr/B552845/katRealTime2/trades2';
const SAMPLE = path.join(__dirname, '..', 'data', 'market_prices_sample.json');
const OUT = path.join(__dirname, '..', 'data', 'market_prices.json');
const SERVICE_KEY = env.DATA_GO_KR_SERVICE_KEY;

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

function todayKst() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, '0')}-${String(kst.getUTCDate()).padStart(2, '0')}`;
}

function extractItems(json) {
  const candidates = [
    json?.response?.body?.items?.item,
    json?.response?.body?.items,
    json?.body?.items?.item,
    json?.items?.item,
    json?.items,
    json?.data
  ];
  const raw = candidates.find(Boolean) || [];
  return Array.isArray(raw) ? raw : [raw].filter(Boolean);
}

function valueOf(row, names, fallback = '') {
  for (const name of names) {
    if (row && row[name] !== undefined && row[name] !== null && row[name] !== '') return row[name];
  }
  return fallback;
}

function normalizeRow(row) {
  const item = valueOf(row, ['gds_sclsf_nm', 'gds_mclsf_nm', 'gds_lclsf_nm', 'item', 'itemName'], '품목 미확인');
  const price = Number(valueOf(row, ['scsbd_prc', 'price', 'prc'], 0)) || 0;
  const qty = valueOf(row, ['qty', 'unit_qty', 'quantity'], '');
  const unit = [valueOf(row, ['unit_qty'], ''), valueOf(row, ['unit_nm'], ''), valueOf(row, ['pkg_nm'], '')].filter(Boolean).join(' ') || '단위 미확인';
  return {
    item,
    date: String(valueOf(row, ['trd_clcln_ymd', 'scsbd_dt', 'date'], todayKst())).slice(0, 10),
    marketName: valueOf(row, ['whsl_mrkt_nm', 'marketName'], '도매시장 미확인'),
    corporationName: valueOf(row, ['corp_nm', 'corporationName'], '법인 미확인'),
    unit,
    quantity: qty,
    price,
    origin: valueOf(row, ['plor_nm', 'origin'], '산지 미확인'),
    change: valueOf(row, ['change'], '샘플 대비'),
    type: '경락가'
  };
}

async function fetchTrades() {
  const url = new URL(ENDPOINT);
  url.searchParams.set('serviceKey', SERVICE_KEY);
  url.searchParams.set('returnType', 'json');
  url.searchParams.set('pageNo', '1');
  url.searchParams.set('numOfRows', '80');
  url.searchParams.set('cond[trd_clcln_ymd::EQ]', todayKst());

  const res = await fetch(url);
  if (!res.ok) throw new Error(`market HTTP ${res.status}`);
  const json = await res.json();
  const items = extractItems(json);
  if (!items.length) throw new Error('market empty items');
  return items.map(normalizeRow).filter(item => item.item && item.price !== undefined).slice(0, 40);
}

async function main() {
  await ensureOutFromSample();
  if (!SERVICE_KEY) {
    console.warn('DATA_GO_KR_SERVICE_KEY is not set. Keeping existing market_prices.json or sample JSON.');
    return;
  }

  try {
    const items = await fetchTrades();
    await writeJson(OUT, {
      updatedAt: todayKst(),
      source: '한국농수산식품유통공사_전국 공영도매시장 실시간 경매정보',
      notice: '최신 경매정보 기반 참고자료입니다. API 응답 필드는 방어적으로 정규화했습니다.',
      items
    });
    console.log(`Updated ${OUT}: ${items.length} items`);
  } catch (err) {
    console.error(`Market price fetch failed. Keeping existing JSON. ${err.message}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});

#!/usr/bin/env node
'use strict';

const fs = require('fs/promises');
const path = require('path');
const { env } = process;

const BASE_URL = 'http://ncpms.rda.go.kr/npmsAPI/service';
const SAMPLE = path.join(__dirname, '..', 'data', 'ncpms_disease_sample.json');
const OUT = path.join(__dirname, '..', 'data', 'ncpms_disease_cases.json');
const API_KEY = env.NCPMS_API_KEY;

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

function extractXmlTag(xml, tag) {
  const match = String(xml).match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? match[1].replace(/<!\\[CDATA\\[|\\]\\]>/g, '').trim() : '';
}

function extractItemsFromXml(xml) {
  const itemMatches = String(xml).match(/<item[^>]*>[\s\S]*?<\/item>/gi) || [];
  return itemMatches.map(itemXml => ({
    sickKey: extractXmlTag(itemXml, 'sickKey'),
    sickNameKor: extractXmlTag(itemXml, 'sickNameKor') || extractXmlTag(itemXml, 'sickName'),
    cropName: extractXmlTag(itemXml, 'cropName'),
    symptoms: extractXmlTag(itemXml, 'symptoms'),
    occurrenceCondition: extractXmlTag(itemXml, 'environ' + 'ment'),
    preventionMethod: extractXmlTag(itemXml, 'preventionMethod'),
    pathogenName: extractXmlTag(itemXml, 'pathogenName'),
    image: extractXmlTag(itemXml, 'image')
  })).filter(item => item.sickNameKor || item.cropName);
}

function normalizeJsonItems(json) {
  const raw = json?.response?.body?.items?.item || json?.body?.items?.item || json?.items?.item || json?.items || [];
  const rows = Array.isArray(raw) ? raw : [raw].filter(Boolean);
  return rows.map(row => ({
    sickKey: row.sickKey || '',
    sickNameKor: row.sickNameKor || row.sickName || '',
    cropName: row.cropName || '',
    symptoms: row.symptoms || '',
    occurrenceCondition: row['environ' + 'ment'] || '',
    preventionMethod: row.preventionMethod || '',
    pathogenName: row.pathogenName || '',
    image: row.image || row.imageList?.[0] || ''
  })).filter(item => item.sickNameKor || item.cropName);
}

async function fetchDiseaseList() {
  const url = new URL(BASE_URL);
  url.searchParams.set('apiKey', API_KEY);
  url.searchParams.set('serviceCode', 'SVC01');
  url.searchParams.set('serviceType', 'AA001');
  url.searchParams.set('displayCount', '30');
  url.searchParams.set('startPoint', '1');

  const res = await fetch(url);
  if (!res.ok) throw new Error(`NCPMS HTTP ${res.status}`);
  const text = await res.text();
  try {
    return normalizeJsonItems(JSON.parse(text));
  } catch {
    return extractItemsFromXml(text);
  }
}

async function main() {
  await ensureOutFromSample();
  if (!API_KEY) {
    console.warn('NCPMS_API_KEY is not set. Keeping existing ncpms_disease_cases.json or sample JSON.');
    return;
  }

  try {
    const items = await fetchDiseaseList();
    if (!items.length) throw new Error('NCPMS empty items');
    await writeJson(OUT, {
      source: '국가농작물병해충관리시스템 NCPMS',
      updatedAt: new Date().toISOString(),
      notice: 'AI 진단 결과와 연결 가능한 공공 병해충 자료 검증 데이터입니다.',
      items
    });
    console.log(`Updated ${OUT}: ${items.length} items`);
  } catch (err) {
    console.error(`NCPMS fetch failed. Keeping existing JSON. ${err.message}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});

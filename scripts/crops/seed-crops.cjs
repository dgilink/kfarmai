#!/usr/bin/env node
'use strict';

const { buildSeed, writeJson } = require('./shared.cjs');

function compactCalendar(seed) {
  return seed.crops.map(crop => {
    const tasks = seed.crop_calendar
      .filter(row => row.crop_id === crop.id && row.status === 'approved')
      .sort((a, b) => a.month - b.month || a.week - b.week);
    const months = [...new Set(tasks.map(row => row.month))].map(month => ({
      month,
      tasks: tasks
        .filter(row => row.month === month)
        .map(row => `${row.task_title}: ${row.task_description}`)
    }));
    return {
      crop: crop.name_ko,
      cropId: crop.id,
      category: crop.category,
      currentMonthTasks: tasks.slice(0, 3).map(row => row.task_title),
      months,
      relatedGuide: `crop-guide.html?crop=${encodeURIComponent(crop.name_ko)}`,
      publicSources: ['농촌진흥청 농사로', '국가농작물병해충관리시스템 NCPMS'],
      notice: '지역, 품종, 시설/노지 조건에 따라 시기가 달라질 수 있습니다. 공식자료와 현장 상태를 함께 확인하세요.'
    };
  });
}

function compactGuides(seed) {
  return seed.crops.map(crop => {
    const pests = seed.pest_disease_items
      .filter(row => row.crop_id === crop.id && row.status === 'approved')
      .slice(0, 4)
      .map(row => `${row.name_ko}: ${row.prevention}`);
    return {
      crop: crop.name_ko,
      cropId: crop.id,
      category: crop.category,
      summary: crop.description_short,
      stages: seed.crop_calendar
        .filter(row => row.crop_id === crop.id && row.status === 'approved')
        .slice(0, 4)
        .map(row => row.task_description),
      soilWater: ['물마름과 과습을 함께 확인하세요.', '비가 잦거나 고온이 이어지면 농업날씨를 같이 확인하세요.'],
      pestCheck: pests,
      harvestCare: ['수확 전 작업 이력과 안전사용기준을 확인하세요.'],
      relatedWeather: ['기온, 강수확률, 강수량, 습도, 풍속을 함께 확인하세요.'],
      publicSources: ['농촌진흥청 농사로', '국가농작물병해충관리시스템 NCPMS'],
      notice: '이 가이드는 공공정보 확인을 돕는 참고자료입니다.'
    };
  });
}

function main() {
  const seed = buildSeed();
  writeJson('data/crops_mvp.json', seed);
  writeJson('data/crop-calendar-index.json', compactCalendar(seed));
  writeJson('data/crop-guide-index.json', compactGuides(seed));
  console.log(`seeded ${seed.crops.length} crops, ${seed.crop_calendar.length} calendar rows`);
}

main();

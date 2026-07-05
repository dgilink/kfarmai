#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT, 'data');
const STATUS = {
  DRAFT: 'draft',
  NEEDS_REVIEW: 'needs_review',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  HIDDEN: 'hidden'
};

const OFFICIAL_SOURCES = [
  {
    id: 'source-rda-nongsaro',
    source_type: 'official_portal',
    source_name: '농촌진흥청 농사로',
    source_url: 'https://www.nongsaro.go.kr/',
    api_name: 'NONGSARO',
    api_endpoint: 'https://api.nongsaro.go.kr/service',
    license_type: '공식 공공 농업정보',
    collected_at: null,
    raw_payload: null,
    content_hash: 'seed-official-nongsaro'
  },
  {
    id: 'source-rda-ncpms',
    source_type: 'official_portal',
    source_name: '국가농작물병해충관리시스템 NCPMS',
    source_url: 'https://ncpms.rda.go.kr/',
    api_name: 'NCPMS',
    api_endpoint: 'http://ncpms.rda.go.kr/npmsAPI/service',
    license_type: '공식 병해충 정보',
    collected_at: null,
    raw_payload: null,
    content_hash: 'seed-official-ncpms'
  },
  {
    id: 'source-rda-weekly',
    source_type: 'official_portal',
    source_name: '농촌진흥청 주간농사정보',
    source_url: 'https://www.nongsaro.go.kr/',
    api_name: 'NONGSARO_WEEKLY',
    api_endpoint: 'https://api.nongsaro.go.kr/service',
    license_type: '공식 공공 농업정보',
    collected_at: null,
    raw_payload: null,
    content_hash: 'seed-official-weekly'
  }
];

const CROPS = [
  ['rice', '벼', 'rice', 'grain', 'A', true, 2, ['쌀', '논벼', '수도작'], 'ㅂ', '논물과 병해충 시기를 함께 확인해야 하는 기본 식량작물입니다.'],
  ['pepper', '고추', 'pepper', 'fruit_vegetable', 'A', true, 3, ['풋고추', '홍고추', '청양고추'], 'ㄱㅊ', '고온기 물마름, 탄저병, 바이러스 의심 증상을 자주 확인해야 합니다.'],
  ['strawberry', '딸기', 'strawberry', 'fruit_vegetable', 'A', true, 1, ['시설딸기', '노지딸기', '딸기모종'], 'ㄸㄱ', '육묘와 재배 시기를 나누어 온습도와 병해충을 확인합니다.'],
  ['tomato', '토마토', 'tomato', 'fruit_vegetable', 'A', true, 4, ['방울토마토', '대추방울토마토'], 'ㅌㅁㅌ', '시설과 노지 조건에 따라 착과, 환기, 병해충 확인이 달라집니다.'],
  ['cucumber', '오이', 'cucumber', 'fruit_vegetable', 'A', true, 6, ['청오이', '백다다기', '취청오이'], 'ㅇㅇ', '물관리와 환기가 생육과 과실 품질에 크게 영향을 줍니다.'],
  ['lettuce', '상추', 'lettuce', 'leaf_vegetable', 'A', true, 5, ['청상추', '적상추', '쌈채소'], 'ㅅㅊ', '고온기 추대와 잎끝마름을 함께 확인하는 잎채소입니다.'],
  ['cabbage', '배추', 'napa cabbage', 'leaf_vegetable', 'B', false, 11, ['김장배추', '봄배추', '얼갈이'], 'ㅂㅊ', '정식 뒤 물관리와 결구기 병해충 확인이 중요합니다.'],
  ['radish', '무', 'radish', 'root_vegetable', 'B', false, 12, ['김장무', '열무', '총각무'], 'ㅁ', '파종 뒤 초기 생육과 뿌리 갈라짐을 확인합니다.'],
  ['garlic', '마늘', 'garlic', 'bulb_vegetable', 'A', true, 10, ['한지형마늘', '난지형마늘'], 'ㅁㄴ', '월동 뒤 잎마름과 수확 전 건조 상태를 확인합니다.'],
  ['onion', '양파', 'onion', 'bulb_vegetable', 'B', false, 13, ['조생양파', '중만생양파'], 'ㅇㅍ', '월동과 비대기 물관리, 잎마름 증상을 확인합니다.'],
  ['potato', '감자', 'potato', 'root_vegetable', 'B', false, 14, ['봄감자', '가을감자'], 'ㄱㅈ', '싹틔우기, 북주기, 역병 의심 증상을 확인합니다.'],
  ['sweet_potato', '고구마', 'sweet potato', 'root_vegetable', 'B', false, 15, ['밤고구마', '호박고구마'], 'ㄱㄱㅁ', '순 심기 뒤 활착과 덩이뿌리 비대기를 확인합니다.'],
  ['soybean', '콩', 'soybean', 'grain', 'B', false, 16, ['대두', '서리태', '백태'], 'ㅋ', '개화기 물관리와 꼬투리 형성기를 확인합니다.'],
  ['corn', '옥수수', 'corn', 'grain', 'B', false, 17, ['찰옥수수', '단옥수수'], 'ㅇㅅㅅ', '출수 전후 물마름과 쓰러짐을 확인합니다.'],
  ['green_onion', '대파', 'green onion', 'leaf_vegetable', 'C', false, 18, ['파', '쪽파', '실파'], 'ㄷㅍ', '북주기와 잎마름, 녹병 의심 증상을 확인합니다.'],
  ['spinach', '시금치', 'spinach', 'leaf_vegetable', 'C', false, 19, ['섬초', '포항초'], 'ㅅㄱㅊ', '저온기 생육과 추대, 물빠짐을 확인합니다.'],
  ['eggplant', '가지', 'eggplant', 'fruit_vegetable', 'C', false, 20, ['흑가지', '장가지'], 'ㄱㅈ', '시설과 노지에서 온도, 착과, 잎 상태를 확인합니다.'],
  ['pumpkin', '호박', 'pumpkin', 'fruit_vegetable', 'C', false, 21, ['애호박', '쥬키니', '단호박'], 'ㅎㅂ', '덩굴 생육, 수분, 흰가루 증상을 확인합니다.'],
  ['watermelon', '수박', 'watermelon', 'fruit_vegetable', 'C', false, 22, ['하우스수박', '노지수박'], 'ㅅㅂ', '착과 뒤 물관리와 과실 이상증상을 확인합니다.'],
  ['korean_melon', '참외', 'korean melon', 'fruit_vegetable', 'C', false, 23, ['성주참외', '은천참외'], 'ㅊㅇ', '시설재배 중심으로 환기, 착과, 흰가루 증상을 확인합니다.'],
  ['apple', '사과', 'apple', 'fruit_tree', 'A', true, 7, ['홍로', '후지', '부사'], 'ㅅㄱ', '개화, 적과, 병해충 예찰 시기를 지역에 맞춰 확인합니다.'],
  ['peach', '복숭아', 'peach', 'fruit_tree', 'A', true, 8, ['황도', '백도'], 'ㅂㅅㅇ', '개화기 저온, 적과, 수확 전 병해충을 확인합니다.'],
  ['pear', '배', 'pear', 'fruit_tree', 'A', true, 9, ['신고배', '원황'], 'ㅂ', '개화, 적과, 봉지 씌우기, 검은별무늬병을 확인합니다.']
];

const FACILITY_REQUIRED = new Set(['strawberry', 'pepper', 'tomato', 'cucumber', 'lettuce', 'eggplant', 'pumpkin', 'watermelon', 'korean_melon']);
const OPEN_FIELD_CENTER = new Set(['rice', 'garlic', 'onion', 'potato', 'sweet_potato', 'soybean', 'corn', 'cabbage', 'radish', 'green_onion', 'spinach']);
const FRUIT_TREES = new Set(['apple', 'peach', 'pear']);

function nowIso() {
  return new Date().toISOString();
}

function cropRows() {
  const now = nowIso();
  return CROPS.map(([id, name_ko, name_en, category, priority_grade, is_featured, display_order, aliases, chosung, description_short]) => ({
    id,
    name_ko,
    name_en,
    category,
    priority_grade,
    is_featured,
    display_order,
    aliases,
    chosung,
    description_short,
    status: STATUS.APPROVED,
    created_at: now,
    updated_at: now
  }));
}

function variantsForCrop(crop) {
  const now = nowIso();
  const rows = [{
    id: `${crop.id}-default`,
    crop_id: crop.id,
    variant_type: 'purpose',
    variant_name: '기본',
    description: '작물 기본 재배 흐름입니다.',
    is_default: true,
    display_order: 1,
    status: STATUS.APPROVED,
    created_at: now,
    updated_at: now
  }];
  if (crop.id === 'strawberry') {
    rows.push(
      variant('strawberry-nursery', crop.id, 'purpose', '육묘용', '모주 관리부터 정식 전 모종 확인까지 봅니다.', false, 2),
      variant('strawberry-cultivation', crop.id, 'purpose', '재배용', '정식부터 수확기 온습도와 과실 상태까지 봅니다.', false, 3)
    );
  }
  if (crop.id === 'tomato') {
    rows.push(
      variant('tomato-cherry', crop.id, 'crop_type', '방울토마토', '1차 MVP에서는 토마토 기본 달력과 연결하고 별칭으로 검색합니다.', false, 2),
      variant('tomato-nursery', crop.id, 'purpose', '육묘용', '육묘 전용 데이터 확장 예정입니다.', false, 3),
      variant('tomato-cultivation', crop.id, 'purpose', '재배용', '재배용 기본 흐름입니다.', false, 4)
    );
  }
  if (crop.id === 'pepper') {
    rows.push(
      variant('pepper-nursery', crop.id, 'purpose', '육묘용', '파종부터 정식 전 묘 상태 확인까지 봅니다.', false, 2),
      variant('pepper-cultivation', crop.id, 'purpose', '재배용', '정식 뒤 생육, 병해충 확인, 수확 흐름입니다.', false, 3)
    );
  }
  return rows;
}

function variant(id, crop_id, variant_type, variant_name, description, is_default, display_order) {
  const now = nowIso();
  return { id, crop_id, variant_type, variant_name, description, is_default, display_order, status: STATUS.APPROVED, created_at: now, updated_at: now };
}

function conditionRows(crops, variants) {
  const now = nowIso();
  const rows = [];
  for (const crop of crops) {
    const cropVariants = variants.filter(v => v.crop_id === crop.id);
    const regionGroups = ['all', 'central', 'southern', 'jeju', 'highland'];
    const cultivationTypes = FACILITY_REQUIRED.has(crop.id)
      ? ['open_field', 'greenhouse']
      : (FRUIT_TREES.has(crop.id) || OPEN_FIELD_CENTER.has(crop.id) ? ['open_field'] : ['not_applicable']);
    for (const cv of cropVariants) {
      for (const region_group of regionGroups) {
        for (const cultivation_type of cultivationTypes) {
          rows.push({
            id: `${crop.id}-${cv.id.replace(`${crop.id}-`, '')}-${region_group}-${cultivation_type}`,
            crop_id: crop.id,
            variant_id: cv.id,
            region_group,
            cultivation_type,
            is_available: true,
            notes: region_group === 'all' ? '전국 공통 참고 흐름입니다.' : '지역 차이는 공식자료 확인이 필요합니다.',
            status: STATUS.APPROVED,
            created_at: now,
            updated_at: now
          });
        }
      }
    }
  }
  return rows;
}

function calendarRows(crops, variants, conditions) {
  const now = nowIso();
  const rows = [];
  for (const crop of crops) {
    const base = calendarTemplate(crop);
    const cropConditions = conditions.filter(c => c.crop_id === crop.id && c.region_group === 'all');
    for (const condition of cropConditions) {
      for (const item of base) {
        rows.push({
          id: `${condition.id}-${item.month}-${item.week}-${item.task_type}`,
          crop_id: crop.id,
          variant_id: condition.variant_id,
          condition_id: condition.id,
          month: item.month,
          week: item.week,
          task_type: item.task_type,
          task_title: item.task_title,
          task_description: item.task_description,
          importance: item.importance,
          source_id: item.source_id || 'source-rda-nongsaro',
          status: STATUS.APPROVED,
          created_at: now,
          updated_at: now
        });
      }
    }
  }
  return rows;
}

function calendarTemplate(crop) {
  if (crop.id === 'strawberry') return [
    task(3, 2, 'nursery', '모주 상태 확인', '모주 잎과 뿌리 상태를 보고 병해충 의심 증상을 기록하세요.', 'medium'),
    task(5, 2, 'nursery', '런너 발생 관리', '런너가 나오면 자묘 확보 위치와 포트 상태를 확인하세요.', 'high'),
    task(7, 2, 'watering', '육묘기 온습도 확인', '고온과 과습이 겹치면 잎끝마름과 병해충을 같이 확인하세요.', 'high'),
    task(9, 2, 'planting', '정식 전 모종 확인', '뿌리 발달과 잎 상태를 확인한 뒤 정식 일정을 잡으세요.', 'high'),
    task(10, 2, 'flowering', '출뢰와 개화 확인', '꽃대와 환기 상태를 보고 잿빛곰팡이병 의심 증상을 확인하세요.', 'high'),
    task(12, 2, 'harvest', '수확기 온습도 관리', '과실 무름과 곰팡이 증상을 자주 확인하세요.', 'high')
  ];
  if (crop.id === 'pepper') return [
    task(2, 2, 'seed', '파종과 육묘 시작', '육묘 온도와 물마름을 확인하고 웃자람을 기록하세요.', 'medium'),
    task(5, 1, 'planting', '정식과 활착 확인', '정식 뒤 뿌리 활착, 지주, 물마름을 확인하세요.', 'high'),
    task(6, 3, 'pest_check', '바이러스 의심 증상 확인', '잎 말림, 얼룩, 위축 증상이 보이면 공공정보를 확인하세요.', 'high'),
    task(7, 2, 'pest_check', '탄저병과 역병 확인', '비가 잦으면 열매 반점과 줄기 밑 시듦을 자주 확인하세요.', 'high'),
    task(8, 2, 'harvest', '수확과 생리장해 확인', '열매 상태와 물관리 이력을 함께 기록하세요.', 'medium')
  ];
  if (crop.id === 'tomato') return [
    task(2, 2, 'nursery', '육묘 상태 확인', '모종 웃자람과 잎색을 확인하세요.', 'medium'),
    task(4, 2, 'planting', '정식과 지주 세우기', '시설은 환기, 노지는 강풍과 물마름을 함께 확인하세요.', 'high'),
    task(5, 3, 'flowering', '개화와 착과 확인', '꽃 떨어짐과 고온 스트레스 여부를 기록하세요.', 'high'),
    task(6, 3, 'fruiting', '과실 비대기 확인', '배꼽썩음과 열과가 보이면 수분 변화를 확인하세요.', 'high'),
    task(7, 2, 'pest_check', '잎 반점과 시듦 확인', '병해충 의심 증상은 NCPMS 공식자료와 함께 확인하세요.', 'high')
  ];
  if (FRUIT_TREES.has(crop.id)) return [
    task(3, 3, 'pruning', '전정 뒤 나무 상태 확인', '가지와 꽃눈 상태를 확인하고 지역 저온 예보를 같이 보세요.', 'medium'),
    task(4, 2, 'flowering', '개화기 확인', '저온과 강풍 뒤 꽃 상태를 확인하세요.', 'high'),
    task(5, 3, 'fruiting', '적과와 착과 상태 확인', '열매 달림과 병해충 의심 증상을 함께 확인하세요.', 'high'),
    task(7, 2, 'pest_check', '여름 병해충 확인', '잎과 열매의 반점, 갈변, 벌레 피해를 기록하세요.', 'high'),
    task(9, 2, 'harvest', '수확 전 확인', '수확 전 품질과 안전사용기준 확인이 필요합니다.', 'medium')
  ];
  if (crop.category === 'leaf_vegetable') return [
    task(3, 2, 'seed', '파종 또는 정식 준비', '물빠짐과 초기 활착을 확인하세요.', 'medium'),
    task(4, 3, 'growth_management', '잎 생육 확인', '잎색, 잎끝마름, 벌레 피해를 확인하세요.', 'high'),
    task(6, 2, 'watering', '고온기 물관리', '고온기에는 시듦과 추대를 함께 확인하세요.', 'high'),
    task(9, 2, 'planting', '가을 재배 준비', '지역 온도에 맞춰 파종과 정식 시기를 확인하세요.', 'medium'),
    task(10, 3, 'harvest', '수확 상태 확인', '잎 상태와 작업 이력을 기록하세요.', 'medium')
  ];
  if (crop.category === 'root_vegetable' || crop.category === 'bulb_vegetable') return [
    task(3, 2, 'seed', '파종 또는 싹 상태 확인', '초기 생육과 물빠짐을 확인하세요.', 'medium'),
    task(4, 3, 'growth_management', '초기 생육 관리', '잎색과 뿌리 발달을 확인하세요.', 'medium'),
    task(6, 2, 'harvest', '수확 전 상태 확인', '잎마름과 저장 전 건조 상태를 확인하세요.', 'high'),
    task(9, 3, 'planting', '가을 정식 준비', '월동 작물은 지역별 정식 시기를 확인하세요.', 'medium'),
    task(11, 2, 'storage', '월동과 저장 확인', '저온, 과습, 부패 의심 증상을 확인하세요.', 'medium')
  ];
  return [
    task(4, 2, 'seed', '파종 준비', '지역 온도와 토양 수분을 확인하세요.', 'medium'),
    task(5, 3, 'growth_management', '초기 생육 확인', '활착과 물마름을 확인하세요.', 'medium'),
    task(7, 2, 'pest_check', '병해충 확인', '잎과 줄기, 열매 이상증상을 기록하세요.', 'high'),
    task(8, 3, 'watering', '고온기 관리', '고온과 강우 뒤 생육 변화를 확인하세요.', 'high'),
    task(9, 3, 'harvest', '수확 전 확인', '수확기와 저장 전 상태를 확인하세요.', 'medium')
  ];
}

function task(month, week, task_type, task_title, task_description, importance) {
  return { month, week, task_type, task_title, task_description, importance, source_id: 'source-rda-nongsaro' };
}

function imageRows(crops, variants) {
  const now = nowIso();
  return crops.flatMap(crop => [
    {
      id: `${crop.id}-representative-pending`,
      crop_id: crop.id,
      variant_id: `${crop.id}-default`,
      image_type: 'representative',
      title: `${crop.name_ko} 공식 대표사진`,
      description: '공식 출처 이미지 매핑 필요',
      growth_stage: '',
      symptom_type: '',
      disease_pest_name: '',
      source_name: '공식 출처 확인 필요',
      source_url: '',
      license_type: '',
      original_image_url: '',
      local_path: '',
      is_official_source: false,
      status: STATUS.NEEDS_REVIEW,
      display_order: 1,
      created_at: now,
      updated_at: now
    }
  ]);
}

function pestDiseaseRows(crops) {
  const now = nowIso();
  const priority = {
    pepper: [
      ['탄저병', 'disease'], ['역병', 'disease'], ['바이러스 의심 증상', 'unknown_symptom'],
      ['담배나방 피해', 'pest'], ['시듦 증상', 'unknown_symptom'], ['생리장해', 'physiological_disorder']
    ],
    strawberry: [['잿빛곰팡이병', 'disease'], ['응애 피해', 'pest'], ['과실 이상증상', 'physiological_disorder']],
    tomato: [['잎 반점', 'unknown_symptom'], ['역병', 'disease'], ['배꼽썩음', 'physiological_disorder']],
    apple: [['검은별무늬병', 'disease'], ['화상병 의심 증상', 'disease']],
    peach: [['잿빛무늬병', 'disease'], ['순나방 피해', 'pest']],
    pear: [['검은별무늬병', 'disease'], ['배나무이 피해', 'pest']]
  };
  return crops.flatMap(crop => {
    const list = priority[crop.id] || [['잎 반점', 'unknown_symptom'], ['시듦 증상', 'unknown_symptom'], ['벌레 피해', 'pest']];
    return list.map(([name_ko, item_type], index) => ({
      id: `${crop.id}-pest-${index + 1}`,
      crop_id: crop.id,
      name_ko,
      item_type,
      symptoms: '실제 증상 설명은 공식 원문 확인 후 보강합니다.',
      occurrence_condition: '발생 조건은 지역, 날씨, 재배방식에 따라 달라질 수 있습니다.',
      prevention: '공식 병해충 정보와 현장 상태를 함께 확인하세요.',
      control_method: '특정 농약을 추천하지 않습니다. 농약 사용 전 등록 작물, 병해충, 사용시기, 희석배수, 안전사용기준을 확인하세요.',
      source_id: 'source-rda-ncpms',
      has_images: false,
      status: STATUS.APPROVED,
      created_at: now,
      updated_at: now
    }));
  });
}

function buildSeed() {
  const crops = cropRows();
  const crop_variants = crops.flatMap(variantsForCrop);
  const crop_conditions = conditionRows(crops, crop_variants);
  const crop_calendar = calendarRows(crops, crop_variants, crop_conditions);
  const crop_images = imageRows(crops, crop_variants);
  const pest_disease_items = pestDiseaseRows(crops);
  return {
    meta: {
      generated_at: nowIso(),
      status_policy: '사용자 화면은 approved 데이터만 노출합니다. 공식 이미지가 검수 전이면 needs_review 상태로 저장하고 화면에는 준비 중으로 표시합니다.',
      allowed_sources: ['농촌진흥청', '농사로', 'NCPMS', '공공데이터포털', '농업기술원', '시군 농업기술센터', '스마트팜코리아', '공공누리 공식 자료']
    },
    crops,
    crop_variants,
    crop_conditions,
    crop_calendar,
    crop_images,
    pest_disease_items,
    data_sources: OFFICIAL_SOURCES
  };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(rel, data) {
  const file = path.join(ROOT, rel);
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function readEnvFiles() {
  const env = { ...process.env };
  for (const name of ['.env', '.env.local']) {
    const file = path.join(ROOT, name);
    if (!fs.existsSync(file)) continue;
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      if (!line.trim() || line.trim().startsWith('#')) continue;
      const match = line.match(/^\s*([^=]+?)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const key = match[1].trim();
      const value = match[2].trim().replace(/^['"]|['"]$/g, '');
      if (!env[key]) env[key] = value;
    }
  }
  return env;
}

function stripTags(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function hasImageText(value) {
  return /(thumbImg|oriImg|image|img|fileUrl|atchFile|\.jpg|\.jpeg|\.png|\.gif)/i.test(String(value || ''));
}

module.exports = {
  ROOT,
  DATA_DIR,
  STATUS,
  CROPS,
  buildSeed,
  writeJson,
  readEnvFiles,
  stripTags,
  hasImageText
};

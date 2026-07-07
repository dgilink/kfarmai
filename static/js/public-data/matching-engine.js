(function () {
  'use strict';

  var SOURCE_MAP = window.KF_PUBLIC_DATA_SOURCES || {};

  var CROP_ALIASES = {
    '고추': ['고추', '청양고추', '풋고추', '홍고추', 'pepper'],
    '토마토': ['토마토', '방울토마토', 'tomato'],
    '딸기': ['딸기', 'strawberry'],
    '벼': ['벼', '쌀', '논벼', 'rice'],
    '콩': ['콩', '대두', '콩깍지', '꼬투리', '두협', 'soybean']
  };

  var SYMPTOM_ALIASES = {
    '잎말림': ['잎말림', '잎이 말림', '잎 오그라듦', '신엽 말림', '잎이 쪼그라듦', '오그라듦'],
    '탄저병': ['탄저병', '고추 탄저병', '탄저', '과실 반점', '열매 반점'],
    '반점': ['반점', '잎 반점', '갈색 반점', '검은 반점', '얼룩'],
    '잿빛곰팡이': ['잿빛곰팡이', '회색 곰팡이', '곰팡이', '과실 물러짐'],
    '도열병': ['도열병', '잎도열', '목도열', '벼 반점'],
    '흰가루병': ['흰가루병', '흰 가루', '하얀 가루', '백분', '가루 증상'],
    '노균병': ['노균병', '노균', '잎 뒷면 곰팡이', '잎 뒷면 병반'],
    '역병': ['역병', '줄기 썩음', '뿌리 썩음', '시들음 역병'],
    '끝마름': ['끝마름', '잎끝 마름', '잎 끝 마름', 'tipburn', '칼슘 부족'],
    '잎곰팡이병': ['잎곰팡이병', '잎 곰팡이', '토마토 잎곰팡이', '잎 뒷면 곰팡이'],
    '흰잎마름병': ['흰잎마름병', '잎마름병', '벼 잎마름', '잎 끝 마름']
  };

  var CATEGORY_TARGETS = {
    pest: ['ncpms', 'psis', 'cropGuide', 'localAgency'],
    disease: ['ncpms', 'psis', 'cropGuide', 'localAgency'],
    environment: ['agriWeather', 'cropGuide', 'nongsaro'],
    nutrition: ['cropGuide', 'nongsaro', 'localAgency'],
    water: ['agriWeather', 'cropGuide', 'nongsaro'],
    management: ['cropGuide', 'nongsaro'],
    unknown: ['ncpms', 'cropGuide', 'localAgency']
  };

  var MATCH_CASES = [
    {
      id: 'pepper-leaf-curl',
      crop: '고추',
      symptom: '잎말림',
      aliases: ['고추 잎말림', '잎말림', '잎 오그라듦'],
      aiCandidateHints: ['해충 피해 가능성', '바이러스성 증상 가능성', '고온·건조 스트레스'],
      mainSummary: 'AI 후보 중 해충·바이러스·환경 스트레스 항목은 공공데이터 출처와 함께 확인할 수 있습니다.',
      sources: ['ncpms', 'psis', 'agriWeather', 'cropGuide', 'localAgency']
    },
    {
      id: 'pepper-anthracnose',
      crop: '고추',
      symptom: '탄저병',
      aliases: ['고추 탄저병', '탄저병', '탄저', '과실 반점', '열매 반점'],
      aiCandidateHints: ['탄저병 가능성', '병해 가능성', '강우·습도 영향'],
      mainSummary: 'AI 후보 중 탄저병·병해·강우와 습도 영향 항목은 공공데이터 출처와 함께 확인할 수 있습니다.',
      sources: ['ncpms', 'psis', 'agriWeather', 'cropGuide', 'localAgency'],
      sourceEvidence: {
        ncpms: 'NCPMS 고추 탄저병 자료 기준으로 과실·잎 병반과 발생환경을 AI 결과와 대조합니다.',
        psis: '농약안전정보에서 고추·탄저병 등록 여부와 제품 라벨 기준을 별도로 확인해야 합니다.',
        agriWeather: '탄저병은 비·습도 같은 다습 조건과 함께 확인할 필요가 있습니다.',
        cropGuide: '재배자료 기준으로 병든 부위 정리, 통풍, 과습 관리 포인트를 확인합니다.',
        localAgency: '사진, 발생 시기, 최근 강우·습도 정보를 정리해 관계기관 확인을 권장합니다.'
      }
    },
    {
      id: 'tomato-spot',
      crop: '토마토',
      symptom: '반점',
      aliases: ['토마토 반점', '잎 반점', '갈색 반점'],
      aiCandidateHints: ['곰팡이성 병 가능성', '세균성 병 가능성', '고온다습 환경 영향'],
      mainSummary: 'AI 후보 중 곰팡이성 병·세균성 병·고온다습 환경 항목은 공공데이터 출처와 함께 확인할 수 있습니다.',
      sources: ['ncpms', 'psis', 'agriWeather', 'cropGuide', 'localAgency'],
      sourceEvidence: {
        ncpms: 'NCPMS 토마토 병해 자료 기준으로 반점성 병해와 증상 설명을 대조합니다.',
        psis: '농약안전정보에서 토마토 등록작물·대상 병해충·라벨 기준을 확인해야 합니다.',
        agriWeather: '반점성 병해 후보는 습도, 강수, 고온다습 조건과 함께 확인합니다.',
        cropGuide: '재배자료 기준으로 통풍, 잎 관리, 시설 내 습도 관리 포인트를 확인합니다.',
        localAgency: '반점 색과 번짐 정도, 잎 뒷면 사진을 정리해 관계기관 확인을 권장합니다.'
      }
    },
    {
      id: 'strawberry-gray-mold',
      crop: '딸기',
      symptom: '잿빛곰팡이',
      aliases: ['딸기 잿빛곰팡이', '회색 곰팡이', '과실 물러짐'],
      aiCandidateHints: ['곰팡이성 병 가능성', '과습·통풍 부족 가능성', '시설 내 습도 영향'],
      mainSummary: 'AI 후보 중 곰팡이성 병·과습·통풍 부족 항목은 공공데이터 출처와 함께 확인할 수 있습니다.',
      sources: ['ncpms', 'psis', 'agriWeather', 'cropGuide', 'localAgency'],
      sourceEvidence: {
        ncpms: 'NCPMS 딸기 병해 자료 기준으로 잿빛곰팡이 증상과 발생환경을 대조합니다.',
        psis: '농약안전정보에서 딸기 등록작물·대상 병해충·라벨 기준을 확인해야 합니다.',
        agriWeather: '잿빛곰팡이 후보는 시설 내 습도와 강수·환기 조건을 함께 확인합니다.',
        cropGuide: '재배자료 기준으로 과습, 통풍, 꽃·과실 주변 관리 포인트를 확인합니다.',
        localAgency: '곰팡이 발생 부위와 시설 습도 정보를 정리해 관계기관 확인을 권장합니다.'
      }
    },
    {
      id: 'rice-blast',
      crop: '벼',
      symptom: '도열병',
      aliases: ['벼 도열병', '잎도열', '목도열'],
      aiCandidateHints: ['병해 가능성', '고습 환경 영향', '생육단계 영향'],
      mainSummary: 'AI 후보 중 병해·고습 환경·생육단계 항목은 공공데이터 출처와 함께 확인할 수 있습니다.',
      sources: ['ncpms', 'psis', 'agriWeather', 'nongsaro', 'localAgency'],
      sourceEvidence: {
        ncpms: 'NCPMS 벼 도열병 자료 기준으로 병반 형태와 발생환경을 AI 결과와 대조합니다.',
        psis: '농약안전정보에서 벼 등록작물·대상 병해충·라벨 기준을 확인해야 합니다.',
        agriWeather: '도열병 후보는 강수, 습도, 기온 같은 고습 조건과 함께 확인합니다.',
        nongsaro: '농사로 재배기술 자료 기준으로 생육단계와 논 관리 포인트를 확인합니다.',
        localAgency: '잎 병반 사진, 생육단계, 최근 강우 정보를 정리해 관계기관 확인을 권장합니다.'
      }
    },
    {
      id: 'pepper-powdery-mildew',
      crop: '고추',
      symptom: '흰가루병',
      aliases: ['고추 흰가루병', '흰 가루', '하얀 가루', '백분'],
      aiCandidateHints: ['곰팡이성 병 가능성', '통풍 부족 가능성', '습도 영향'],
      mainSummary: 'AI 후보 중 흰가루병·통풍·습도 항목은 공공데이터 출처와 함께 확인할 수 있습니다.',
      sources: ['ncpms', 'psis', 'agriWeather', 'cropGuide', 'localAgency']
    },
    {
      id: 'pepper-blight',
      crop: '고추',
      symptom: '역병',
      aliases: ['고추 역병', '줄기 썩음', '뿌리 썩음', '시들음'],
      aiCandidateHints: ['병해 가능성', '과습 가능성', '배수 문제'],
      mainSummary: 'AI 후보 중 역병·과습·배수 관련 항목은 공공데이터 출처와 함께 확인할 수 있습니다.',
      sources: ['ncpms', 'psis', 'agriWeather', 'cropGuide', 'localAgency']
    },
    {
      id: 'tomato-leaf-mold',
      crop: '토마토',
      symptom: '잎곰팡이병',
      aliases: ['토마토 잎곰팡이병', '토마토 잎 곰팡이', '잎 뒷면 곰팡이'],
      aiCandidateHints: ['곰팡이성 병 가능성', '고습 환경 영향', '통풍 부족 가능성'],
      mainSummary: 'AI 후보 중 잎곰팡이병·고습·통풍 부족 항목은 공공데이터 출처와 함께 확인할 수 있습니다.',
      sources: ['ncpms', 'psis', 'agriWeather', 'cropGuide', 'localAgency']
    },
    {
      id: 'cucumber-downy-mildew',
      crop: '오이',
      symptom: '노균병',
      aliases: ['오이 노균병', '노균', '잎 뒷면 곰팡이', '오이 잎 반점'],
      aiCandidateHints: ['곰팡이성 병 가능성', '과습 가능성', '통풍 부족 가능성'],
      mainSummary: 'AI 후보 중 노균병·과습·통풍 부족 항목은 공공데이터 출처와 함께 확인할 수 있습니다.',
      sources: ['ncpms', 'psis', 'agriWeather', 'cropGuide', 'localAgency']
    },
    {
      id: 'lettuce-tipburn',
      crop: '상추',
      symptom: '끝마름',
      aliases: ['상추 끝마름', '잎끝 마름', '잎 끝 마름', '칼슘 부족'],
      aiCandidateHints: ['양분 관리 가능성', '수분 스트레스 가능성', '고온 영향'],
      mainSummary: 'AI 후보 중 끝마름·수분 스트레스·양분 관리 항목은 공공데이터 출처와 함께 확인할 수 있습니다.',
      sources: ['agriWeather', 'cropGuide', 'nongsaro', 'localAgency']
    },
    {
      id: 'strawberry-powdery-mildew',
      crop: '딸기',
      symptom: '흰가루병',
      aliases: ['딸기 흰가루병', '딸기 흰 가루', '하얀 가루'],
      aiCandidateHints: ['곰팡이성 병 가능성', '시설 내 습도 영향', '통풍 부족 가능성'],
      mainSummary: 'AI 후보 중 흰가루병·시설 습도·통풍 조건은 공공데이터 출처와 함께 확인할 수 있습니다.',
      sources: ['ncpms', 'psis', 'agriWeather', 'cropGuide', 'localAgency']
    },
    {
      id: 'rice-bacterial-leaf-blight',
      crop: '벼',
      symptom: '흰잎마름병',
      aliases: ['벼 흰잎마름병', '흰잎마름', '벼 잎마름', '잎 끝 마름'],
      aiCandidateHints: ['병해 가능성', '강우 영향', '생육단계 영향'],
      mainSummary: 'AI 후보 중 흰잎마름병·강우·생육단계 항목은 공공데이터 출처와 함께 확인할 수 있습니다.',
      sources: ['ncpms', 'psis', 'agriWeather', 'nongsaro', 'localAgency']
    },
    {
      id: 'potato-late-blight',
      crop: '감자',
      symptom: '역병',
      aliases: ['감자 역병', '감자 잎 반점', '감자 줄기 썩음'],
      aiCandidateHints: ['병해 가능성', '저온다습 영향', '강우 영향'],
      mainSummary: 'AI 후보 중 역병·저온다습·강우 영향 항목은 공공데이터 출처와 함께 확인할 수 있습니다.',
      sources: ['ncpms', 'psis', 'agriWeather', 'cropGuide', 'localAgency']
    },
    {
      id: 'soybean-anthracnose',
      crop: '콩',
      symptom: '탄저병',
      aliases: ['콩 탄저병', '대두 탄저병', '콩깍지 탄저병', '꼬투리 탄저병', '콩 병반', '콩깍지 병반'],
      aiCandidateHints: ['탄저병 가능성', '반점병 가능성', '고온다습 환경'],
      mainSummary: 'AI 후보 중 탄저병·반점성 병해·고온다습 환경 항목은 공공데이터 출처와 함께 확인할 수 있습니다.',
      sources: ['ncpms', 'psis', 'agriWeather', 'cropGuide', 'localAgency'],
      sourceEvidence: {
        ncpms: 'NCPMS 콩 병해 자료 기준으로 꼬투리 병반과 탄저병 유사 항목을 대조합니다.',
        psis: '농약안전정보에서 콩 등록작물·대상 병해충·라벨 기준을 확인해야 합니다.',
        agriWeather: '콩 탄저병 후보는 고온다습, 강우, 습도 조건과 함께 확인합니다.',
        cropGuide: '재배자료 기준으로 병든 잔재물 정리, 통풍, 과습 관리 포인트를 확인합니다.',
        localAgency: '꼬투리 병반 사진과 발생환경을 정리해 관계기관 확인을 권장합니다.'
      }
    }
  ];

  var SUPPLEMENTAL_CROPS = [
    { id: 'cucumber', name: '오이', aliases: ['오이', '백다다기오이', '취청오이', 'cucumber'] },
    { id: 'eggplant', name: '가지', aliases: ['가지', 'eggplant'] },
    { id: 'lettuce', name: '상추', aliases: ['상추', '청상추', '적상추', 'lettuce'] },
    { id: 'cabbage', name: '배추', aliases: ['배추', '김장배추', 'napa cabbage'] },
    { id: 'radish', name: '무', aliases: ['무', '무우', 'radish'] },
    { id: 'green-onion', name: '파', aliases: ['파', '대파', '쪽파', 'green onion'] },
    { id: 'onion', name: '양파', aliases: ['양파', 'onion'] },
    { id: 'garlic', name: '마늘', aliases: ['마늘', 'garlic'] },
    { id: 'potato', name: '감자', aliases: ['감자', 'potato'] },
    { id: 'sweet-potato', name: '고구마', aliases: ['고구마', 'sweet potato'] },
    { id: 'soybean', name: '콩', aliases: ['콩', '대두', 'soybean'] },
    { id: 'corn', name: '옥수수', aliases: ['옥수수', 'corn'] },
    { id: 'watermelon', name: '수박', aliases: ['수박', 'watermelon'] },
    { id: 'oriental-melon', name: '참외', aliases: ['참외', 'oriental melon'] },
    { id: 'melon', name: '멜론', aliases: ['멜론', 'melon'] },
    { id: 'pumpkin', name: '호박', aliases: ['호박', '애호박', '단호박', 'pumpkin'] },
    { id: 'apple', name: '사과', aliases: ['사과', 'apple'] },
    { id: 'pear', name: '배', aliases: ['배', 'pear'] },
    { id: 'peach', name: '복숭아', aliases: ['복숭아', 'peach'] },
    { id: 'grape', name: '포도', aliases: ['포도', 'grape'] },
    { id: 'citrus', name: '감귤', aliases: ['감귤', '귤', 'citrus'] },
    { id: 'blueberry', name: '블루베리', aliases: ['블루베리', 'blueberry'] },
    { id: 'rose', name: '장미', aliases: ['장미', 'rose'] },
    { id: 'chrysanthemum', name: '국화', aliases: ['국화', 'chrysanthemum'] },
    { id: 'monstera', name: '몬스테라', aliases: ['몬스테라', 'monstera'] },
    { id: 'pothos', name: '스킨답서스', aliases: ['스킨답서스', '포토스', 'pothos'] },
    { id: 'basil', name: '바질', aliases: ['바질', 'basil'] },
    { id: 'rosemary', name: '로즈마리', aliases: ['로즈마리', 'rosemary'] },
    { id: 'spinach', name: '시금치', aliases: ['시금치', 'spinach'] },
    { id: 'perilla', name: '깻잎', aliases: ['깻잎', '들깨', 'perilla'] },
    { id: 'sesame', name: '참깨', aliases: ['참깨', 'sesame'] },
    { id: 'carrot', name: '당근', aliases: ['당근', 'carrot'] },
    { id: 'broccoli', name: '브로콜리', aliases: ['브로콜리', 'broccoli'] },
    { id: 'cauliflower', name: '콜리플라워', aliases: ['콜리플라워', 'cauliflower'] },
    { id: 'chive', name: '부추', aliases: ['부추', 'chive'] },
    { id: 'ginger', name: '생강', aliases: ['생강', 'ginger'] },
    { id: 'taro', name: '토란', aliases: ['토란', 'taro'] },
    { id: 'yam', name: '마', aliases: ['마', '산약', 'yam'] },
    { id: 'peanut', name: '땅콩', aliases: ['땅콩', 'peanut'] },
    { id: 'adzuki', name: '팥', aliases: ['팥', 'adzuki bean'] },
    { id: 'barley', name: '보리', aliases: ['보리', 'barley'] },
    { id: 'wheat', name: '밀', aliases: ['밀', 'wheat'] },
    { id: 'oat', name: '귀리', aliases: ['귀리', 'oat'] },
    { id: 'kiwi', name: '키위', aliases: ['키위', '참다래', 'kiwi'] },
    { id: 'plum', name: '자두', aliases: ['자두', 'plum'] },
    { id: 'persimmon', name: '감', aliases: ['감', '단감', 'persimmon'] },
    { id: 'jujube', name: '대추', aliases: ['대추', 'jujube'] },
    { id: 'chestnut', name: '밤', aliases: ['밤', 'chestnut'] },
    { id: 'fig', name: '무화과', aliases: ['무화과', 'fig'] },
    { id: 'raspberry', name: '복분자', aliases: ['복분자', '산딸기', 'raspberry'] },
    { id: 'paprika', name: '파프리카', aliases: ['파프리카', '피망', 'paprika', 'bell pepper'] },
    { id: 'celery', name: '셀러리', aliases: ['셀러리', 'celery'] },
    { id: 'parsley', name: '파슬리', aliases: ['파슬리', 'parsley'] },
    { id: 'mint', name: '민트', aliases: ['민트', 'mint'] },
    { id: 'lavender', name: '라벤더', aliases: ['라벤더', 'lavender'] },
    { id: 'orchid', name: '난', aliases: ['난', '서양란', '동양란', 'orchid'] },
    { id: 'succulent', name: '다육식물', aliases: ['다육식물', '다육이', 'succulent'] },
    { id: 'ficus', name: '고무나무', aliases: ['고무나무', 'ficus'] },
    { id: 'areca-palm', name: '아레카야자', aliases: ['아레카야자', 'areca palm'] },
    { id: 'hydrangea', name: '수국', aliases: ['수국', 'hydrangea'] },
    { id: 'marigold', name: '금잔화', aliases: ['금잔화', '메리골드', 'marigold'] },
    { id: 'zucchini', name: '주키니', aliases: ['주키니', 'zucchini'] }
  ];

  var SUPPLEMENTAL_SYMPTOM_RULES = [
    {
      id: 'leaf-dry',
      symptom: '잎마름',
      aliases: ['잎마름', '잎 끝 마름', '잎끝마름', '마름', '갈변'],
      aiCandidateHints: ['수분 스트레스 가능성', '고온·건조 영향', '양분 불균형 가능성'],
      mainSummary: '잎마름 증상은 수분 스트레스, 고온·건조, 양분 불균형 항목을 공공데이터 출처와 함께 확인할 수 있습니다.',
      sources: ['agriWeather', 'cropGuide', 'nongsaro', 'localAgency']
    },
    {
      id: 'leaf-yellow',
      symptom: '잎노랑',
      aliases: ['잎노랑', '잎 노랑', '노란잎', '황화', '잎이 노래짐', '잎이 노랗게 변함'],
      aiCandidateHints: ['양분 부족 가능성', '과습·배수 문제 가능성', '생육환경 영향'],
      mainSummary: '잎노랑 증상은 양분, 물관리, 생육환경 항목을 공공데이터 출처와 함께 확인할 수 있습니다.',
      sources: ['cropGuide', 'nongsaro', 'agriWeather', 'localAgency']
    },
    {
      id: 'spots',
      symptom: '반점',
      aliases: ['반점', '잎 반점', '갈색 반점', '검은 반점', '얼룩', '점무늬'],
      aiCandidateHints: ['병해 가능성', '과습 환경 영향', '환경 스트레스 가능성'],
      mainSummary: '반점 증상은 병해, 과습 환경, 재배환경 항목을 공공데이터 출처와 함께 확인할 수 있습니다.',
      sources: ['ncpms', 'psis', 'agriWeather', 'cropGuide', 'localAgency']
    },
    {
      id: 'wilting',
      symptom: '시듦',
      aliases: ['시듦', '시들음', '축 처짐', '처짐', '위조', '잎 처짐'],
      aiCandidateHints: ['물관리 문제 가능성', '뿌리 스트레스 가능성', '병해 가능성'],
      mainSummary: '시듦 증상은 물관리, 뿌리 스트레스, 병해 관련 항목을 공공데이터 출처와 함께 확인할 수 있습니다.',
      sources: ['agriWeather', 'cropGuide', 'ncpms', 'localAgency']
    },
    {
      id: 'growth-poor',
      symptom: '생육부진',
      aliases: ['생육부진', '성장 느림', '잘 안 큼', '왜화', '크지 않음'],
      aiCandidateHints: ['생육환경 영향', '양분 관리 가능성', '재배관리 문제 가능성'],
      mainSummary: '생육부진은 생육단계, 양분 관리, 재배환경 항목을 공공데이터 출처와 함께 확인할 수 있습니다.',
      sources: ['cropGuide', 'nongsaro', 'agriWeather', 'localAgency']
    },
    {
      id: 'mold',
      symptom: '곰팡이',
      aliases: ['곰팡이', '흰 곰팡이', '회색 곰팡이', '균사', '부패', '물러짐'],
      aiCandidateHints: ['곰팡이성 병 가능성', '과습 가능성', '통풍 부족 가능성'],
      mainSummary: '곰팡이 증상은 병해, 과습, 통풍 조건 항목을 공공데이터 출처와 함께 확인할 수 있습니다.',
      sources: ['ncpms', 'psis', 'agriWeather', 'cropGuide', 'localAgency']
    },
    {
      id: 'pest-damage',
      symptom: '해충피해',
      aliases: ['해충피해', '벌레', '진딧물', '총채벌레', '응애', '갉아먹음', '흡즙 피해'],
      aiCandidateHints: ['해충 피해 가능성', '흡즙성 해충 가능성', '잎 피해 확인 필요'],
      mainSummary: '해충피해 의심 증상은 병해충 정보, 대상 병해충, 안전사용기준 항목을 공공데이터 출처와 함께 확인할 수 있습니다.',
      sources: ['ncpms', 'psis', 'cropGuide', 'localAgency']
    },
    {
      id: 'leaf-curl',
      symptom: '잎말림',
      aliases: ['잎말림', '잎 말림', '잎이 말림', '잎 오그라듦', '신엽 말림', '오그라듦'],
      aiCandidateHints: ['해충 피해 가능성', '바이러스성 증상 가능성', '고온·건조 스트레스 가능성'],
      mainSummary: '잎말림 증상은 해충, 바이러스성 증상, 고온·건조 스트레스 항목을 공공데이터 출처와 함께 확인할 수 있습니다.',
      sources: ['ncpms', 'psis', 'agriWeather', 'cropGuide', 'localAgency']
    }
  ];

  function buildSupplementalMatchCases() {
    var cases = [];
    SUPPLEMENTAL_CROPS.forEach(function (crop) {
      SUPPLEMENTAL_SYMPTOM_RULES.forEach(function (rule) {
        cases.push({
          id: crop.id + '-' + rule.id,
          crop: crop.name,
          symptom: rule.symptom,
          aliases: crop.aliases.reduce(function (aliases, cropAlias) {
            return aliases.concat(rule.aliases.map(function (symptomAlias) {
              return cropAlias + ' ' + symptomAlias;
            }));
          }, rule.aliases.slice()),
          aiCandidateHints: rule.aiCandidateHints.slice(),
          mainSummary: crop.name + ' ' + rule.symptom + '은 ' + rule.mainSummary,
          sources: rule.sources.slice()
        });
      });
    });
    return cases;
  }

  MATCH_CASES = MATCH_CASES.concat(buildSupplementalMatchCases()).slice(0, 500);

  var RESULT_TEXTS = {
    ncpms: 'AI 후보 중 병해충·해충 관련 항목은 NCPMS 병해충 정보와 연결됩니다.',
    psis: '농약 사용 판단은 AI 결과가 아니라 공식 안전사용기준과 제품 라벨 확인이 필요합니다.',
    agriWeather: '환경 스트레스 후보는 최근 날씨 조건과 함께 확인할 수 있습니다.',
    cropGuide: '재배관리 후보는 생육단계와 관리포인트를 함께 확인할 수 있습니다.',
    nongsaro: '작목별 재배기술과 일반 관리정보를 함께 확인할 수 있습니다.',
    localAgency: '증상이 계속되거나 피해가 확산되면 사진과 발생환경을 가지고 관계기관 확인을 권장합니다.'
  };

  var DEFAULT_SOURCE_ORDER = ['ncpms', 'psis', 'agriWeather', 'cropGuide', 'localAgency'];

  function cleanText(value) {
    return String(value || '').trim();
  }

  function normalizeForCompare(value) {
    return cleanText(value).toLowerCase().replace(/\s+/g, '');
  }

  function uniqueList(values) {
    var seen = {};
    return values.filter(function (value) {
      var key = cleanText(value);
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function normalizeByAlias(input, aliasMap) {
    var raw = cleanText(input);
    var comparable = normalizeForCompare(raw);
    if (!comparable) return '미입력';

    var keys = Object.keys(aliasMap);
    for (var i = 0; i < keys.length; i += 1) {
      var standard = keys[i];
      var aliases = aliasMap[standard];
      for (var j = 0; j < aliases.length; j += 1) {
        if (normalizeForCompare(aliases[j]) === comparable) {
          return standard;
        }
      }
    }
    return raw;
  }

  function normalizeCrop(input) {
    return normalizeByAlias(input, CROP_ALIASES);
  }

  function normalizeSymptom(input) {
    return normalizeByAlias(input, SYMPTOM_ALIASES);
  }

  function normalizeCandidateCategory(candidate) {
    var category = cleanText(typeof candidate === 'string' ? candidate : candidate && candidate.category);
    return CATEGORY_TARGETS[category] ? category : 'unknown';
  }

  function getTargetsByCategory(category) {
    var normalized = normalizeCandidateCategory({ category: category });
    return CATEGORY_TARGETS[normalized].slice();
  }

  function getCandidates(diagnosis) {
    return Array.isArray(diagnosis && diagnosis.aiCandidates) ? diagnosis.aiCandidates : [];
  }

  function getCandidateLabels(diagnosis) {
    return getCandidates(diagnosis).map(function (candidate) {
      return cleanText(candidate && (candidate.name || candidate.label));
    }).filter(Boolean);
  }

  function getCandidateKeywords(diagnosis) {
    var keywords = [];
    getCandidates(diagnosis).forEach(function (candidate) {
      if (Array.isArray(candidate && candidate.keywords)) {
        keywords = keywords.concat(candidate.keywords);
      }
      if (candidate && (candidate.name || candidate.label)) keywords.push(candidate.name || candidate.label);
      if (candidate && candidate.category) keywords.push(candidate.category);
    });
    return uniqueList(keywords);
  }

  function findCaseMatch(diagnosis) {
    var normalizedCrop = normalizeCrop(diagnosis && diagnosis.crop);
    var normalizedSymptom = normalizeSymptom(diagnosis && diagnosis.symptom);
    var candidateText = getCandidateKeywords(diagnosis).join(' ');
    var combined = normalizeForCompare([diagnosis && diagnosis.crop, diagnosis && diagnosis.symptom, candidateText].filter(Boolean).join(' '));
    var rawSymptom = normalizeForCompare(diagnosis && diagnosis.symptom);
    var bestRule = null;
    var bestScore = 0;

    for (var i = 0; i < MATCH_CASES.length; i += 1) {
      var rule = MATCH_CASES[i];
      if (normalizedCrop === rule.crop && normalizedSymptom === rule.symptom) {
        return rule;
      }

      var cropMatches = normalizedCrop === rule.crop;
      var score = 0;
      if (cropMatches) score += 40;
      if (normalizedSymptom === rule.symptom) score += 35;
      if (combined.indexOf(normalizeForCompare(rule.crop)) >= 0) score += 20;
      if (combined.indexOf(normalizeForCompare(rule.symptom)) >= 0) score += 25;

      var aliasMatches = rule.aliases.some(function (alias) {
        var normalizedAlias = normalizeForCompare(alias);
        var exactAlias = normalizedAlias === combined || normalizedAlias === rawSymptom;
        var containsAlias = normalizedAlias && combined.indexOf(normalizedAlias) >= 0;
        if (exactAlias) score += cropMatches ? 45 : 30;
        if (containsAlias) score += cropMatches ? 35 : 20;
        return exactAlias || containsAlias;
      });

      if (Array.isArray(rule.aiCandidateHints)) {
        rule.aiCandidateHints.forEach(function (hint) {
          var normalizedHint = normalizeForCompare(hint);
          if (normalizedHint && combined.indexOf(normalizedHint) >= 0) score += 15;
        });
      }

      if (aliasMatches && cropMatches) score += 15;

      if (score > bestScore) {
        bestScore = score;
        bestRule = rule;
      }
    }

    return bestScore >= 60 ? bestRule : null;
  }

  function getMatchedKeywords(diagnosis, sourceKey) {
    var baseKeywords = [
      normalizeCrop(diagnosis && diagnosis.crop),
      normalizeSymptom(diagnosis && diagnosis.symptom)
    ];
    var candidateKeywords = getCandidateKeywords(diagnosis);
    var sourceKeywords = {
      ncpms: ['병해충', '해충', '바이러스', '곰팡이', '세균'],
      psis: ['등록작물', '대상 병해충', '안전사용기준'],
      agriWeather: ['고온', '건조', '강수', '습도', '저온', '과습'],
      cropGuide: ['생육단계', '관리포인트', '물관리', '비료관리'],
      nongsaro: ['재배기술', '일반 관리정보'],
      localAgency: ['사진', '발생환경', '관계기관']
    };
    return uniqueList(baseKeywords.concat(candidateKeywords).concat(sourceKeywords[sourceKey] || [])).slice(0, 8);
  }

  function buildMatchedSources(diagnosis, caseRule) {
    var sourceKeys = caseRule && Array.isArray(caseRule.sources) ? caseRule.sources : DEFAULT_SOURCE_ORDER;
    var sourceEvidence = caseRule && caseRule.sourceEvidence ? caseRule.sourceEvidence : {};
    return uniqueList(sourceKeys).map(function (sourceKey) {
      var source = SOURCE_MAP[sourceKey];
      if (!source) return null;
      return {
        sourceKey: source.sourceKey,
        sourceName: source.sourceName,
        shortName: source.shortName,
        checkedPoint: source.checkedPoint,
        matchedKeywords: getMatchedKeywords(diagnosis, sourceKey),
        resultText: sourceEvidence[sourceKey] || RESULT_TEXTS[sourceKey] || '출처 기준으로 함께 확인할 수 있는 항목입니다.',
        sourceUrl: source.sourceUrl,
        type: source.type
      };
    }).filter(Boolean);
  }

  function getFallbackSourceKeys(diagnosis) {
    var candidateTargets = [];
    getCandidates(diagnosis).forEach(function (candidate) {
      candidateTargets = candidateTargets.concat(getTargetsByCategory(normalizeCandidateCategory(candidate)));
    });
    return uniqueList(candidateTargets.concat(DEFAULT_SOURCE_ORDER));
  }

  function buildResultBase(diagnosis) {
    var safeDiagnosis = diagnosis || {};
    return {
      reportType: 'public_data_matching',
      crop: cleanText(safeDiagnosis.crop) || '미입력',
      symptom: cleanText(safeDiagnosis.symptom) || '미입력',
      normalizedCrop: normalizeCrop(safeDiagnosis.crop),
      normalizedSymptom: normalizeSymptom(safeDiagnosis.symptom),
      region: cleanText(safeDiagnosis.region),
      cultivationType: cleanText(safeDiagnosis.cultivationType),
      aiCandidateLabels: getCandidateLabels(safeDiagnosis),
      imageUrl: cleanText(safeDiagnosis.imageUrl || safeDiagnosis.image_url || safeDiagnosis.photoUrl || safeDiagnosis.thumbnailUrl),
      createdAt: new Date().toISOString()
    };
  }

  function buildFallbackMatch(diagnosis) {
    var base = buildResultBase(diagnosis);
    var fallbackRule = {
      sources: getFallbackSourceKeys(diagnosis)
    };
    return Object.assign(base, {
      matchStatus: '일반 확인 항목 안내',
      mainSummary: '입력한 작물·증상에 대한 전용 매칭 사례는 아직 준비 중입니다. 다만 공공데이터 출처 기준으로 확인할 수 있는 항목을 정리했습니다.',
      matchedSources: buildMatchedSources(diagnosis || {}, fallbackRule),
      nextStep: '증상이 계속되거나 피해가 확산되면 사진과 발생환경을 가지고 관계기관 확인을 권장합니다.',
      caution: '이 결과는 참고자료입니다. 공식자료와 전문가 확인을 함께 참고하세요.'
    });
  }

  function matchDiagnosisToPublicData(diagnosis) {
    var safeDiagnosis = diagnosis || {};
    var caseRule = findCaseMatch(safeDiagnosis);
    if (!caseRule) return buildFallbackMatch(safeDiagnosis);

    var base = buildResultBase(safeDiagnosis);
    return Object.assign(base, {
      matchStatus: '공공데이터 관련 항목 매칭됨',
      mainSummary: caseRule.mainSummary,
      matchedSources: buildMatchedSources(safeDiagnosis, caseRule),
      nextStep: '증상이 계속되거나 피해가 확산되면 사진과 발생환경을 가지고 관계기관 확인을 권장합니다.',
      caution: '이 결과는 참고자료입니다. 공식자료와 전문가 확인을 함께 참고하세요.',
      caseId: caseRule.id
    });
  }

  var sampleDiagnoses = {
    pepperLeafCurl: {
      crop: '고추',
      symptom: '잎말림',
      region: '충청권',
      cultivationType: '노지',
      aiCandidates: [
        { name: '해충 피해 가능성', category: 'pest', keywords: ['진딧물', '총채벌레'] },
        { name: '바이러스성 증상 가능성', category: 'disease', keywords: ['바이러스', '모자이크'] },
        { name: '고온·건조 스트레스', category: 'environment', keywords: ['고온', '건조'] }
      ]
    },
    pepperAnthracnose: {
      crop: '고추',
      symptom: '탄저병',
      cultivationType: '노지',
      aiCandidates: [
        { name: '탄저병 가능성', category: 'disease', keywords: ['탄저병', '병해', '과실 반점'] },
        { name: '강우·습도 영향', category: 'environment', keywords: ['강우', '습도', '다습'] },
        { name: '재배관리 확인', category: 'management', keywords: ['관리', '수확기'] }
      ]
    },
    tomatoSpot: {
      crop: '토마토',
      symptom: '반점',
      cultivationType: '시설재배',
      aiCandidates: [
        { name: '곰팡이성 병 가능성', category: 'disease', keywords: ['곰팡이', '반점'] },
        { name: '세균성 병 가능성', category: 'disease', keywords: ['세균', '병해'] },
        { name: '고온다습 환경 영향', category: 'environment', keywords: ['고온', '습도'] }
      ]
    },
    strawberryGrayMold: {
      crop: '딸기',
      symptom: '잿빛곰팡이',
      cultivationType: '시설재배',
      aiCandidates: [
        { name: '곰팡이성 병 가능성', category: 'disease', keywords: ['곰팡이', '잿빛곰팡이'] },
        { name: '과습·통풍 부족 가능성', category: 'environment', keywords: ['과습', '통풍'] },
        { name: '시설 내 습도 영향', category: 'environment', keywords: ['시설', '습도'] }
      ]
    },
    riceBlast: {
      crop: '벼',
      symptom: '도열병',
      cultivationType: '논',
      aiCandidates: [
        { name: '병해 가능성', category: 'disease', keywords: ['도열병', '병해'] },
        { name: '고습 환경 영향', category: 'environment', keywords: ['고습', '강수'] },
        { name: '생육단계 영향', category: 'management', keywords: ['생육단계', '관리'] }
      ]
    },
    fallback: {
      crop: '상추',
      symptom: '끝마름',
      aiCandidates: [
        { name: '수분 스트레스 가능성', category: 'water', keywords: ['수분', '끝마름'] },
        { name: '양분 불균형 가능성', category: 'nutrition', keywords: ['칼슘', '양분'] }
      ]
    }
  };

  window.KFPublicDataMatchingEngine = {
    normalizeCrop: normalizeCrop,
    normalizeSymptom: normalizeSymptom,
    normalizeCandidateCategory: normalizeCandidateCategory,
    getTargetsByCategory: getTargetsByCategory,
    findCaseMatch: findCaseMatch,
    buildMatchedSources: buildMatchedSources,
    buildFallbackMatch: buildFallbackMatch,
    matchDiagnosisToPublicData: matchDiagnosisToPublicData,
    matchCaseCount: MATCH_CASES.length,
    sampleDiagnoses: sampleDiagnoses
  };
}());

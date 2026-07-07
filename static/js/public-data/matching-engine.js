(function () {
  'use strict';

  var SOURCE_MAP = window.KF_PUBLIC_DATA_SOURCES || {};

  var CROP_ALIASES = {
    '고추': ['고추', '청양고추', '풋고추', '홍고추', 'pepper'],
    '토마토': ['토마토', '방울토마토', 'tomato'],
    '딸기': ['딸기', 'strawberry'],
    '벼': ['벼', '쌀', '논벼', 'rice']
  };

  var SYMPTOM_ALIASES = {
    '잎말림': ['잎말림', '잎이 말림', '잎 오그라듦', '신엽 말림', '잎이 쪼그라듦', '오그라듦'],
    '반점': ['반점', '잎 반점', '갈색 반점', '검은 반점', '얼룩'],
    '잿빛곰팡이': ['잿빛곰팡이', '회색 곰팡이', '곰팡이', '과실 물러짐'],
    '도열병': ['도열병', '잎도열', '목도열', '벼 반점']
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
      id: 'tomato-spot',
      crop: '토마토',
      symptom: '반점',
      aliases: ['토마토 반점', '잎 반점', '갈색 반점'],
      aiCandidateHints: ['곰팡이성 병 가능성', '세균성 병 가능성', '고온다습 환경 영향'],
      mainSummary: 'AI 후보 중 곰팡이성 병·세균성 병·고온다습 환경 항목은 공공데이터 출처와 함께 확인할 수 있습니다.',
      sources: ['ncpms', 'psis', 'agriWeather', 'cropGuide', 'localAgency']
    },
    {
      id: 'strawberry-gray-mold',
      crop: '딸기',
      symptom: '잿빛곰팡이',
      aliases: ['딸기 잿빛곰팡이', '회색 곰팡이', '과실 물러짐'],
      aiCandidateHints: ['곰팡이성 병 가능성', '과습·통풍 부족 가능성', '시설 내 습도 영향'],
      mainSummary: 'AI 후보 중 곰팡이성 병·과습·통풍 부족 항목은 공공데이터 출처와 함께 확인할 수 있습니다.',
      sources: ['ncpms', 'psis', 'agriWeather', 'cropGuide', 'localAgency']
    },
    {
      id: 'rice-blast',
      crop: '벼',
      symptom: '도열병',
      aliases: ['벼 도열병', '잎도열', '목도열'],
      aiCandidateHints: ['병해 가능성', '고습 환경 영향', '생육단계 영향'],
      mainSummary: 'AI 후보 중 병해·고습 환경·생육단계 항목은 공공데이터 출처와 함께 확인할 수 있습니다.',
      sources: ['ncpms', 'psis', 'agriWeather', 'nongsaro', 'localAgency']
    }
  ];

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
      return cleanText(candidate && candidate.name);
    }).filter(Boolean);
  }

  function getCandidateKeywords(diagnosis) {
    var keywords = [];
    getCandidates(diagnosis).forEach(function (candidate) {
      if (Array.isArray(candidate && candidate.keywords)) {
        keywords = keywords.concat(candidate.keywords);
      }
      if (candidate && candidate.name) keywords.push(candidate.name);
      if (candidate && candidate.category) keywords.push(candidate.category);
    });
    return uniqueList(keywords);
  }

  function findCaseMatch(diagnosis) {
    var normalizedCrop = normalizeCrop(diagnosis && diagnosis.crop);
    var normalizedSymptom = normalizeSymptom(diagnosis && diagnosis.symptom);
    var combined = normalizeForCompare([diagnosis && diagnosis.crop, diagnosis && diagnosis.symptom].filter(Boolean).join(' '));
    var rawSymptom = normalizeForCompare(diagnosis && diagnosis.symptom);

    for (var i = 0; i < MATCH_CASES.length; i += 1) {
      var rule = MATCH_CASES[i];
      if (normalizedCrop === rule.crop && normalizedSymptom === rule.symptom) {
        return rule;
      }

      var cropMatches = normalizedCrop === rule.crop;
      var aliasMatches = rule.aliases.some(function (alias) {
        var normalizedAlias = normalizeForCompare(alias);
        return normalizedAlias === combined || (cropMatches && normalizedAlias === rawSymptom);
      });

      if (aliasMatches) return rule;
    }
    return null;
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
    return uniqueList(sourceKeys).map(function (sourceKey) {
      var source = SOURCE_MAP[sourceKey];
      if (!source) return null;
      return {
        sourceKey: source.sourceKey,
        sourceName: source.sourceName,
        shortName: source.shortName,
        checkedPoint: source.checkedPoint,
        matchedKeywords: getMatchedKeywords(diagnosis, sourceKey),
        resultText: RESULT_TEXTS[sourceKey] || '출처 기준으로 함께 확인할 수 있는 항목입니다.',
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
      caution: '이 결과는 참고자료입니다. 최종 판단은 공식자료와 전문가 확인이 필요합니다.'
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
      caution: '이 결과는 참고자료입니다. 최종 판단은 공식자료와 전문가 확인이 필요합니다.',
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
    sampleDiagnoses: sampleDiagnoses
  };
}());

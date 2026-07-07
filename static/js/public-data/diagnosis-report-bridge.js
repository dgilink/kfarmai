(function () {
  'use strict';

  var LAST_DIAGNOSIS_KEY = 'kfarmai:lastDiagnosis';
  var LAST_AI_DIAGNOSIS_KEY = 'kfarmai:lastAiDiagnosis';
  var REPORT_HISTORY_KEY = 'kfarmai:publicDataReports';
  var MAX_REPORT_HISTORY = 20;

  function nowIso() {
    return new Date().toISOString();
  }

  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      console.warn('[diagnosis-public-data] ignored broken localStorage value', { key: key });
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn('[diagnosis-public-data] localStorage write failed', { key: key, message: error && error.message });
      return false;
    }
  }

  function asArray(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (value == null || value === '') return [];
    return [value];
  }

  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function firstText() {
    for (var i = 0; i < arguments.length; i += 1) {
      var value = arguments[i];
      if (Array.isArray(value)) value = value.find(Boolean);
      var text = cleanText(value);
      if (text) return text;
    }
    return '';
  }

  function normalizeCandidate(candidate) {
    if (!candidate) return null;
    if (typeof candidate === 'string') {
      return {
        label: cleanText(candidate),
        name: cleanText(candidate),
        category: inferCategory(candidate),
        confidence: 'low',
        keywords: keywordList(candidate),
        reason: ''
      };
    }
    var name = firstText(candidate.name, candidate.title, candidate.label, candidate.cause, candidate.reason);
    if (!name) return null;
    var reason = firstText(candidate.reason, candidate.description, candidate.detail);
    var keywordSource = []
      .concat(asArray(candidate.keywords))
      .concat(asArray(candidate.tags))
      .concat([name, reason])
      .filter(Boolean);
    return {
      label: name,
      name: name,
      category: candidate.category || inferCategory(keywordSource.join(' ')),
      confidence: candidate.confidence || candidate.strength || 'low',
      keywords: unique(keywordSource.flatMap(keywordList)).slice(0, 8),
      reason: reason,
      matchTargets: asArray(candidate.matchTargets)
    };
  }

  function defaultCandidates() {
    return [
      { label: '원인 후보', name: '원인 후보', category: 'unknown', confidence: 'low', keywords: ['원인', '후보'], reason: '' },
      { label: '환경 요인', name: '환경 요인', category: 'environment', confidence: 'low', keywords: ['환경', '요인'], reason: '' },
      { label: '재배관리 요인', name: '재배관리 요인', category: 'management', confidence: 'low', keywords: ['재배관리', '관리'], reason: '' }
    ];
  }

  function keywordList(value) {
    return cleanText(value)
      .split(/[,\s·/|]+/)
      .map(cleanText)
      .filter(function (item) { return item.length >= 2; })
      .slice(0, 8);
  }

  function unique(list) {
    var seen = {};
    return (list || []).filter(function (item) {
      var key = cleanText(item);
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function rawResultText(result) {
    if (typeof result === 'string') return cleanText(result);
    return [
      result && result.aiSummary,
      result && result.summary,
      result && result.result,
      result && result.message,
      result && result.answer,
      result && result.text,
      result && result.content,
      result && result.userText,
      result && result.description,
      result && result.symptom
    ].map(cleanText).filter(Boolean).join(' ');
  }

  var CROP_HINTS = [
    ['고추', /고추|청양고추|풋고추|홍고추/i],
    ['토마토', /토마토|방울토마토/i],
    ['딸기', /딸기/i],
    ['벼', /벼|논벼|도열|쌀/i],
    ['콩', /콩|대두|콩깍지|꼬투리|두협/i],
    ['오이', /오이/i],
    ['상추', /상추/i],
    ['감자', /감자/i],
    ['배추', /배추/i],
    ['무', /무|무우/i]
  ];

  var SYMPTOM_HINTS = [
    ['탄저병', /탄저병|anthracnose|colletotrichum|탄저/i],
    ['잎말림', /잎말림|잎이\s*말|오그라|신엽\s*말림/i],
    ['반점', /반점|병반|갈색\s*반점|검은\s*반점|lesion|leaf\s*spot/i],
    ['잿빛곰팡이', /잿빛곰팡이|회색\s*곰팡이|gray\s*mold|grey\s*mold/i],
    ['도열병', /도열병|잎도열|목도열|blast/i],
    ['흰가루병', /흰가루병|흰\s*가루|하얀\s*가루|powdery/i],
    ['노균병', /노균병|downy/i],
    ['역병', /역병|late\s*blight/i],
    ['끝마름', /끝마름|잎끝\s*마름|tipburn/i],
    ['흰잎마름병', /흰잎마름병|잎마름병/i]
  ];

  function inferFromHints(text, hints) {
    var source = cleanText(text);
    if (!source) return '';
    for (var i = 0; i < hints.length; i += 1) {
      if (hints[i][1].test(source)) return hints[i][0];
    }
    return '';
  }

  function candidatesFromText(text) {
    var source = cleanText(text);
    if (!source) return [];
    var candidateTerms = [
      '탄저병',
      '반점병',
      '갈색 조기낙엽병',
      '흰가루병',
      '노균병',
      '역병',
      '잿빛곰팡이',
      '도열병',
      '흰잎마름병',
      '고온다습 환경',
      '과습',
      '통풍 부족',
      '수분 스트레스',
      '재배관리 요인'
    ];
    return candidateTerms
      .filter(function (term) { return source.indexOf(term) >= 0; })
      .slice(0, 5)
      .map(function (term) {
        return normalizeCandidate({
          name: /환경|과습|통풍|수분|재배관리/.test(term) ? term : term + ' 가능성',
          category: inferCategory(term),
          keywords: keywordList(term),
          reason: ''
        });
      })
      .filter(Boolean);
  }

  function inferCategory(value) {
    var text = cleanText(value).toLowerCase();
    if (/해충|진딧|총채|응애|나방|벌레|충/.test(text)) return 'pest';
    if (/병|곰팡|바이러스|세균|도열|탄저|반점|잿빛/.test(text)) return 'disease';
    if (/고온|저온|건조|과습|습도|강수|바람|환경|스트레스|일조/.test(text)) return 'environment';
    if (/양분|질소|칼슘|마그네슘|비료|영양/.test(text)) return 'nutrition';
    if (/물|수분|관수|배수|뿌리/.test(text)) return 'water';
    if (/관리|통풍|분갈이|전정|밀식|재배/.test(text)) return 'management';
    return 'unknown';
  }

  function normalizeCandidates(result) {
    var source = []
      .concat(asArray(result && result.aiCandidates))
      .concat(asArray(result && result.causeCandidates))
      .concat(asArray(result && result.causes));
    var candidates = source.map(normalizeCandidate).filter(Boolean);
    if (!candidates.length) candidates = candidatesFromText(rawResultText(result));
    return candidates.slice(0, 6);
  }

  function inferSymptom(result, inputContext) {
    var rawText = rawResultText(result);
    var hinted = inferFromHints(rawText, SYMPTOM_HINTS);
    var explicit = firstText(
      inputContext && inputContext.symptom,
      result && result.symptom,
      result && result.mainSymptom,
      result && result.symptoms,
      result && result.symptomKeywords
    );
    if (!explicit) return hinted;
    if (explicit.length > 80 && hinted) return hinted;
    return explicit;
  }

  function firstImageUrl() {
    for (var i = 0; i < arguments.length; i += 1) {
      var value = arguments[i];
      if (Array.isArray(value)) value = value.find(Boolean);
      if (typeof value === 'string' && value.trim().charAt(0) === '[') {
        try {
          var parsed = JSON.parse(value);
          value = Array.isArray(parsed) ? parsed.find(Boolean) : value;
        } catch (error) {}
      }
      var text = cleanText(value);
      if (text) return text;
    }
    return '';
  }

  function inferSummary(result, candidates) {
    return firstText(
      result && result.aiSummary,
      result && result.summary,
      result && result.result,
      result && result.message,
      candidates.map(function (item) { return item.name; }).join(', ')
    );
  }

  function buildStructuredDiagnosis(options) {
    options = options || {};
    var result = options.result || {};
    var inputContext = options.inputContext || {};
    var candidates = normalizeCandidates(result);
    if (!candidates.length) candidates = defaultCandidates();
    var rawText = rawResultText(result);
    var crop = firstText(inputContext.crop, result.crop, result.cropName, result.plant, inferFromHints(rawText, CROP_HINTS));
    var symptom = inferSymptom(result, inputContext);
    var summary = inferSummary(result, candidates);
    var diagnosisId = firstText(result.diagnosisId, result.id) || ('local-' + Date.now().toString(36));
    var categories = unique(candidates.map(function (item) { return item.category || 'unknown'; }));
    var matchingTargets = unique([].concat(
      candidates.flatMap(function (item) { return asArray(item.matchTargets); }),
      categories.flatMap(targetsForCategory)
    )).slice(0, 8);

    return {
      diagnosisId: diagnosisId,
      createdAt: result.createdAt || nowIso(),
      source: options.source || (inputContext.imageAttached ? 'image-ai' : 'ai-reference-diagnosis'),
      inputType: inputContext.imageAttached ? 'image_text' : 'text',
      crop: crop || '미선택',
      cropCandidates: unique(asArray(result.cropCandidates).concat([crop]).filter(Boolean)),
      symptom: symptom || firstText(result.userText, result.description, result.summary) || '증상 미확인',
      symptomKeywords: unique(asArray(result.symptomKeywords).concat(keywordList(symptom))).slice(0, 8),
      region: firstText(inputContext.region, result.region),
      cultivationType: firstText(inputContext.cultivationType, inputContext.env, result.cultivationType, result.type),
      growthStage: firstText(inputContext.growthStage, result.growthStage),
      aiSummary: summary,
      aiCandidates: candidates,
      matchingTargets: matchingTargets.length ? matchingTargets : ['ncpms', 'psis', 'agriWeather', 'cropGuide'],
      confidenceLevel: result.confidenceLevel || 'reference',
      needPublicDataMatching: true,
      cautionText: firstText(result.cautionText, result.safetyNotice) || '이 결과는 AI 참고 진단이며 최종 판단이 아닙니다.',
      nextActions: ['공공데이터 매칭 보고서 생성', 'AI 참고 진단 결과 저장', '관계기관 확인'],
      imageUrl: firstImageUrl(
        inputContext.imageUrl,
        inputContext.image_url,
        inputContext.photoUrl,
        inputContext.thumbnailUrl,
        inputContext.imageUrls,
        inputContext.image_urls,
        result.imageUrl,
        result.image_url,
        result.photoUrl,
        result.thumbnailUrl,
        result.imageUrls,
        result.image_urls
      )
    };
  }

  function targetsForCategory(category) {
    var map = {
      pest: ['ncpms', 'psis', 'cropGuide', 'localAgency'],
      disease: ['ncpms', 'psis', 'cropGuide', 'localAgency'],
      environment: ['agriWeather', 'cropGuide', 'nongsaro'],
      nutrition: ['cropGuide', 'nongsaro', 'localAgency'],
      water: ['agriWeather', 'cropGuide', 'nongsaro'],
      management: ['cropGuide', 'nongsaro'],
      unknown: ['ncpms', 'cropGuide', 'localAgency']
    };
    return map[category] || map.unknown;
  }

  function saveLastDiagnosis(diagnosis) {
    if (!diagnosis) return false;
    var ok = writeJson(LAST_DIAGNOSIS_KEY, diagnosis);
    writeJson(LAST_AI_DIAGNOSIS_KEY, diagnosis);
    return ok;
  }

  function getLastDiagnosis() {
    return readJson(LAST_DIAGNOSIS_KEY, null) || readJson(LAST_AI_DIAGNOSIS_KEY, null);
  }

  function buildPublicDataUrl(diagnosis) {
    var params = new URLSearchParams();
    if (diagnosis && diagnosis.crop && diagnosis.crop !== '미입력') params.set('crop', diagnosis.crop);
    if (diagnosis && diagnosis.symptom && diagnosis.symptom !== '미입력') params.set('symptom', diagnosis.symptom);
    if (diagnosis && diagnosis.region) params.set('region', diagnosis.region);
    if (diagnosis && diagnosis.cultivationType) params.set('type', diagnosis.cultivationType);
    var qs = params.toString();
    return qs ? 'public-data.html?' + qs + '#matchResult' : 'public-data.html#matchResult';
  }

  function goToPublicDataReport(diagnosis) {
    if (diagnosis) saveLastDiagnosis(diagnosis);
    var saved = diagnosis || getLastDiagnosis();
    window.location.href = buildPublicDataUrl(saved);
  }

  function reportKey(report, diagnosis) {
    return [
      cleanText(report && (report.normalizedCrop || report.crop || (diagnosis && diagnosis.crop))),
      cleanText(report && (report.normalizedSymptom || report.symptom || (diagnosis && diagnosis.symptom))),
      cleanText(report && report.matchStatus)
    ].join('|');
  }

  function savePublicDataReport(report, diagnosis) {
    if (!report) return false;
    var history = getPublicDataReports();
    var item = {
      id: 'report-' + Date.now().toString(36),
      createdAt: nowIso(),
      crop: report.normalizedCrop || report.crop || (diagnosis && diagnosis.crop) || '',
      symptom: report.normalizedSymptom || report.symptom || (diagnosis && diagnosis.symptom) || '',
      matchStatus: report.matchStatus || '공공데이터 기준 확인 항목 있음',
      mainSummary: report.mainSummary || '',
      aiCandidateLabels: asArray(report.aiCandidateLabels),
      matchedSources: asArray(report.matchedSources),
      nextStep: report.nextStep || '',
      caution: report.caution || '',
      diagnosis: diagnosis || getLastDiagnosis() || null
    };
    var key = reportKey(item, item.diagnosis);
    history = history.filter(function (row) { return reportKey(row, row.diagnosis) !== key; });
    history.unshift(item);
    return writeJson(REPORT_HISTORY_KEY, history.slice(0, MAX_REPORT_HISTORY));
  }

  function getPublicDataReports() {
    var value = readJson(REPORT_HISTORY_KEY, []);
    return Array.isArray(value) ? value : [];
  }

  function deletePublicDataReport(id) {
    var next = getPublicDataReports().filter(function (row) { return String(row.id) !== String(id); });
    return writeJson(REPORT_HISTORY_KEY, next);
  }

  window.KFDiagnosisPublicDataBridge = {
    LAST_DIAGNOSIS_KEY: LAST_DIAGNOSIS_KEY,
    REPORT_HISTORY_KEY: REPORT_HISTORY_KEY,
    buildStructuredDiagnosis: buildStructuredDiagnosis,
    saveLastDiagnosis: saveLastDiagnosis,
    getLastDiagnosis: getLastDiagnosis,
    buildPublicDataUrl: buildPublicDataUrl,
    goToPublicDataReport: goToPublicDataReport,
    savePublicDataReport: savePublicDataReport,
    getPublicDataReports: getPublicDataReports,
    deletePublicDataReport: deletePublicDataReport
  };
})();

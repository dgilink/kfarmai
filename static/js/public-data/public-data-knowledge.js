(function () {
  'use strict';

  window.KF_PUBLIC_DATA_KNOWLEDGE = {
    'pepper-anthracnose': {
      caseKey: 'pepper-anthracnose',
      crop: '고추',
      symptom: '탄저병 의심',
      title: '고추 탄저병 확인 포인트',
      diseaseSummary: '고추 탄저병 의심 사례는 열매에 둥글거나 움푹 들어간 병반이 생기고 번지는 양상을 함께 확인합니다.',
      symptomPoints: [
        '열매 병반의 모양과 번짐 여부 확인',
        '병반 주변이 검게 변하는지 확인',
        '잎과 줄기 이상 증상이 함께 있는지 확인'
      ],
      environmentPoints: [
        '최근 비가 잦았는지 확인',
        '습도가 높고 통풍이 부족했는지 확인',
        '과실 표면에 물기가 오래 남아 있었는지 확인'
      ],
      managementPoints: [
        '병든 과실이나 잎이 남아 있는지 확인',
        '통풍과 과습 관리 상태 확인',
        '피해가 확산되면 사진과 발생환경을 정리해 관계기관 확인 권장'
      ],
      safetyPoint: '농약 사용 전에는 등록작물, 대상 병해충, 사용시기, 희석배수, 안전사용기준과 제품 라벨 확인이 필요합니다.',
      sourceKeys: ['ncpms', 'psis', 'agriWeather', 'cropGuide', 'localAgency']
    },
    'pepper-leaf-curl': {
      caseKey: 'pepper-leaf-curl',
      crop: '고추',
      symptom: '잎말림',
      title: '고추 잎말림 확인 포인트',
      diseaseSummary: '고추 잎말림은 신엽이 말리거나 오그라드는 양상과 잎 뒷면 해충 흔적을 함께 확인합니다.',
      symptomPoints: [
        '새잎이 말리거나 오그라드는지 확인',
        '잎 뒷면에 해충 흔적이 있는지 확인',
        '모자이크 무늬나 생육 위축이 동반되는지 확인'
      ],
      environmentPoints: [
        '고온이나 건조가 이어졌는지 확인',
        '관수와 배수 상태를 함께 확인',
        '최근 급격한 온도 변화가 있었는지 확인'
      ],
      managementPoints: [
        '피해 잎이 일부인지 전체로 번지는지 기록',
        '잎 뒷면과 새순 사진을 함께 남김',
        '증상이 확산되면 관계기관 확인 권장'
      ],
      safetyPoint: '해충 또는 병 가능성을 확인하더라도 농약 사용 전에는 등록작물, 대상 병해충, 안전사용기준과 제품 라벨 확인이 필요합니다.',
      sourceKeys: ['ncpms', 'psis', 'agriWeather', 'cropGuide', 'localAgency']
    },
    'tomato-spot': {
      caseKey: 'tomato-spot',
      crop: '토마토',
      symptom: '반점',
      title: '토마토 반점 확인 포인트',
      diseaseSummary: '토마토 반점 의심 사례는 잎에 갈색 또는 검은 반점이 생기고 넓어지는지 확인합니다.',
      symptomPoints: [
        '잎 반점의 색과 모양 확인',
        '반점 주변이 번지는지 확인',
        '줄기나 열매에도 이상이 있는지 확인'
      ],
      environmentPoints: [
        '고온다습한 조건이 이어졌는지 확인',
        '시설 안 통풍이 부족했는지 확인',
        '잎이 젖은 상태로 오래 남았는지 확인'
      ],
      managementPoints: [
        '병든 잎이 남아 있는지 확인',
        '환기와 과습 관리 상태 확인',
        '곰팡이성 또는 세균성 병 가능성은 공식자료로 확인'
      ],
      safetyPoint: '농약 사용 전에는 토마토 등록 여부, 대상 병해충, 사용시기, 희석배수, 안전사용기준과 제품 라벨 확인이 필요합니다.',
      sourceKeys: ['ncpms', 'psis', 'agriWeather', 'cropGuide', 'localAgency']
    },
    'tomato-late-blight': {
      caseKey: 'tomato-late-blight',
      crop: '토마토',
      symptom: '역병 의심',
      title: '토마토 역병 확인 포인트',
      diseaseSummary: '토마토 역병 의심 사례는 잎이나 줄기에 물에 젖은 듯한 병반과 물러지는 양상이 있는지 확인합니다.',
      symptomPoints: [
        '잎과 줄기의 물러짐 여부 확인',
        '물에 젖은 듯한 병반이 있는지 확인',
        '짧은 기간에 병반이 넓어지는지 확인'
      ],
      environmentPoints: [
        '비가 잦거나 습도가 높았는지 확인',
        '잎이 젖은 상태가 오래 지속됐는지 확인',
        '시설 안 습도와 온도 조건을 함께 확인'
      ],
      managementPoints: [
        '병든 부위가 남아 있는지 확인',
        '환기와 배수 상태 확인',
        '발생 시기와 환경을 기록해 공식자료와 비교'
      ],
      safetyPoint: '농약 사용 전에는 토마토 등록작물 여부, 대상 병해충, 사용시기, 희석배수, 안전사용기준과 제품 라벨 확인이 필요합니다.',
      sourceKeys: ['ncpms', 'psis', 'agriWeather', 'cropGuide', 'localAgency']
    },
    'strawberry-gray-mold': {
      caseKey: 'strawberry-gray-mold',
      crop: '딸기',
      symptom: '잿빛곰팡이 의심',
      title: '딸기 잿빛곰팡이 확인 포인트',
      diseaseSummary: '딸기 잿빛곰팡이 의심 사례는 꽃이나 과실 주변에 회색 곰팡이와 물러짐이 보이는지 확인합니다.',
      symptomPoints: [
        '과실이나 꽃 주변의 회색 곰팡이 확인',
        '물러짐이 함께 나타나는지 확인',
        '피해 부위가 주변으로 번지는지 확인'
      ],
      environmentPoints: [
        '시설 안 습도가 높았는지 확인',
        '통풍이 부족했는지 확인',
        '꽃과 과실 주변에 물기가 오래 남았는지 확인'
      ],
      managementPoints: [
        '병든 과실이나 꽃이 남아 있는지 확인',
        '환기와 과습 관리 상태 확인',
        '피해 부위가 늘면 사진과 환경을 정리해 관계기관 확인 권장'
      ],
      safetyPoint: '농약 사용 전에는 딸기 등록 여부, 대상 병해충, 사용시기, 희석배수, 안전사용기준과 제품 라벨 확인이 필요합니다.',
      sourceKeys: ['ncpms', 'psis', 'agriWeather', 'cropGuide', 'localAgency']
    },
    'rice-blast': {
      caseKey: 'rice-blast',
      crop: '벼',
      symptom: '도열병',
      title: '벼 도열병 확인 포인트',
      diseaseSummary: '벼 도열병 의심 사례는 잎에 길쭉한 병반이 생기거나 생육단계에 따라 병반이 번지는지 확인합니다.',
      symptomPoints: [
        '잎 병반의 모양과 증가 여부 확인',
        '목이나 이삭 부위 이상 동반 여부 확인',
        '생육단계별 증상 변화를 함께 확인'
      ],
      environmentPoints: [
        '최근 강우와 고습 조건 확인',
        '논 주변 습도와 온도 조건 확인',
        '잎이 젖은 상태로 오래 있었는지 확인'
      ],
      managementPoints: [
        '발생 시기와 생육단계를 기록',
        '물관리와 포장 상태 확인',
        '사진과 발생환경을 정리해 공식자료와 비교'
      ],
      safetyPoint: '농약 사용 전에는 벼 등록 여부, 대상 병해충, 사용시기, 희석배수, 안전사용기준과 제품 라벨 확인이 필요합니다.',
      sourceKeys: ['ncpms', 'psis', 'agriWeather', 'nongsaro', 'localAgency']
    }
  };
}());

(function () {
  'use strict';

  window.KF_PUBLIC_DATA_SOURCES = {
    ncpms: {
      sourceKey: 'ncpms',
      sourceName: 'NCPMS 국가농작물병해충관리시스템',
      shortName: 'NCPMS',
      checkedPoint: '병해충·발생환경 확인',
      sourceUrl: 'https://ncpms.rda.go.kr/',
      type: 'external',
      description: '작물별 병해충 정보와 발생환경을 확인하는 공식 시스템입니다.',
      caution: '병해충 정보는 참고자료이며, 현장 상태와 공식자료를 함께 확인해야 합니다.'
    },
    psis: {
      sourceKey: 'psis',
      sourceName: '농약안전정보시스템',
      shortName: '농약안전정보',
      checkedPoint: '등록작물·대상 병해충·안전사용기준·등록취소 여부 확인',
      sourceUrl: 'https://psis.rda.go.kr/',
      type: 'external',
      description: '농약 등록정보, 안전사용기준, 등록취소 여부를 확인하는 공식 시스템입니다.',
      caution: '농약 사용 여부는 제품 라벨과 공식 안전사용기준을 기준으로 확인해야 합니다.'
    },
    agriWeather: {
      sourceKey: 'agriWeather',
      sourceName: 'kFarmAI 농업날씨',
      shortName: '농업날씨',
      checkedPoint: '기온·강수·습도·고온·건조 확인',
      sourceUrl: 'agri-weather.html',
      type: 'internal',
      description: '기온, 강수, 습도, 풍속 등 재배환경을 참고합니다.',
      caution: '날씨 정보는 환경 조건을 이해하기 위한 참고자료입니다.'
    },
    nongsaro: {
      sourceKey: 'nongsaro',
      sourceName: '농사로',
      shortName: '농사로',
      checkedPoint: '작목별 재배기술 확인',
      sourceUrl: 'https://www.nongsaro.go.kr/',
      type: 'external',
      description: '농촌진흥청 농업기술포털에서 작목별 재배기술을 확인합니다.',
      caution: '공식 기술자료와 실제 재배환경을 함께 확인해야 합니다.'
    },
    cropGuide: {
      sourceKey: 'cropGuide',
      sourceName: 'kFarmAI 재배가이드',
      shortName: '재배가이드',
      checkedPoint: '생육단계·관리포인트 확인',
      sourceUrl: 'crop-guide.html',
      type: 'internal',
      description: '작물별 재배 흐름과 관리 포인트를 참고합니다.',
      caution: '재배가이드는 일반 관리 방향을 정리한 참고자료입니다.'
    },
    localAgency: {
      sourceKey: 'localAgency',
      sourceName: '관계기관 확인',
      shortName: '관계기관',
      checkedPoint: '사진·발생환경 상담 권장',
      sourceUrl: null,
      type: 'guidance',
      description: '피해가 확산되거나 판단이 어려우면 가까운 공식 기관에 사진과 발생환경을 함께 문의합니다.',
      caution: '확인되지 않은 담당자명이나 전화번호는 제공하지 않습니다.'
    }
  };
}());

// kfarmai 통합 검색 데이터
// 상토회사, 종자회사, 작물보호제회사, 비료회사, 정부기관, 협회 포함

const searchDB = {
  santo: [], // santo_data.js에서 로드
  seed: [],  // seed_data.js에서 로드
  cpa: [],   // cpa_data.js에서 로드
  fert: [],  // fert_data.js에서 로드
  gov: [
    { name: "농림축산식품부", category: "정부기관", url: "https://www.mafra.go.kr" },
    { name: "농촌진흥청", category: "정부기관", url: "https://www.rda.go.kr" },
    { name: "국립농산물품질관리원", category: "정부기관", url: "https://www.naqs.go.kr" },
    { name: "국립농업과학원", category: "정부기관", url: "https://www.nias.go.kr" },
    { name: "국립종자원", category: "정부기관", url: "https://www.seed.go.kr" },
    { name: "국립원예특작과학원", category: "정부기관", url: "https://www.nihhs.go.kr" },
    { name: "농약안전정보시스템", category: "정부기관", url: "https://psis.rda.go.kr" },
    { name: "농사로", category: "정보서비스", url: "https://www.nongsaro.go.kr" },
    { name: "한국농어촌공사", category: "공공기관", url: "https://www.ekr.or.kr" },
    { name: "한국농수산식품유통공사", category: "공공기관", url: "https://www.at.or.kr" },
  ],
  assoc: [
    { name: "한국상토협회", category: "협회", url: "http://www.sangto.org" },
    { name: "한국종자협회", category: "협회", url: "https://kosaseed.or.kr" },
    { name: "한국비료협회", category: "협회", url: "https://www.fert-kfia.or.kr" },
    { name: "한국작물보호협회", category: "협회", url: "https://www.kcpa.or.kr" },
    { name: "작물보호제유통협회", category: "협회", url: "https://www.koreacpa.org" },
  ]
};

// 통합 검색 함수
function kfSearch(keyword) {
  if (!keyword || keyword.length < 1) return [];
  const kw = keyword.toLowerCase();
  const results = [];

  // 상토회사
  if (typeof santoData !== 'undefined') {
    santoData.forEach(d => {
      if (d.company.includes(keyword) || d.products.includes(keyword) || d.addr.includes(keyword)) {
        results.push({ name: d.company, category: '상토회사', addr: d.addr, url: d.homepage, tel: '' });
      }
    });
  }
  // 종자회사
  if (typeof seedData !== 'undefined') {
    seedData.forEach(d => {
      if (d.company.includes(keyword) || d.products.includes(keyword) || d.addr.includes(keyword)) {
        results.push({ name: d.company, category: '종자회사', addr: d.addr, url: d.homepage, tel: d.tel });
      }
    });
  }
  // 작물보호제회사
  if (typeof cpaData !== 'undefined') {
    cpaData.forEach(d => {
      if (d.company.includes(keyword) || d.addr.includes(keyword)) {
        results.push({ name: d.company, category: '작물보호제회사', addr: d.addr, url: d.homepage, tel: d.tel });
      }
    });
  }
  // 비료회사
  if (typeof fertData !== 'undefined') {
    fertData.forEach(d => {
      if (d.company.includes(keyword) || d.products.includes(keyword) || d.addr.includes(keyword)) {
        results.push({ name: d.company, category: '비료회사', addr: d.addr, url: d.homepage, tel: d.tel });
      }
    });
  }
  // 정부기관/협회
  searchDB.gov.concat(searchDB.assoc).forEach(d => {
    if (d.name.includes(keyword)) {
      results.push({ name: d.name, category: d.category, addr: '', url: d.url, tel: '' });
    }
  });

  return results;
}

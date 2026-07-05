window.KFARM_CROP_PAGE_DATA = (() => {
  const coreIds = [
    "rice", "pepper", "strawberry", "tomato", "cucumber", "watermelon",
    "korean-melon", "cabbage", "radish", "lettuce", "garlic", "onion",
    "green-onion", "potato", "sweet-potato", "soybean", "corn", "apple",
    "pear", "peach", "grape", "citrus", "blueberry"
  ];

  const categoryLabels = {
    grain: "곡류",
    fruit_vegetable: "과채류",
    leaf_vegetable: "엽채류",
    root_vegetable: "근채류",
    bulb_vegetable: "인경채류",
    bean: "두류",
    fruit_tree: "과수"
  };

  const cropRows = [
    ["rice", "벼", "grain", "🌾", ["쌀", "논벼", "수도"], "벼는 물관리와 생육 단계별 기상 확인이 중요한 대표 식량작물입니다. 모판부터 수확 전까지 논물, 온도, 쓰러짐 여부를 함께 확인하는 참고자료입니다.", { sowing: "4월 전후 못자리 준비", transplant: "5월 전후 이앙", harvest: "9~10월 수확" }],
    ["pepper", "고추", "fruit_vegetable", "🌶️", ["풋고추", "청양고추", "홍고추"], "고추는 고온기 수분 변화와 배수, 잎말림·시들음 같은 증상 확인이 중요합니다. 노지와 시설 조건에 따라 관수와 통풍 관리가 달라질 수 있습니다.", { sowing: "2~3월 육묘", transplant: "4~5월 정식", harvest: "7~10월 수확" }],
    ["strawberry", "딸기", "fruit_vegetable", "🍓", ["설향딸기", "딸기묘"], "딸기는 육묘, 정식, 저온기 보온과 습도 관리가 이어지는 작물입니다. 잎끝 마름, 과습, 곰팡이성 증상을 함께 확인하는 참고자료입니다.", { sowing: "여름~가을 육묘", transplant: "9~10월 정식", harvest: "12~5월 수확" }],
    ["tomato", "토마토", "fruit_vegetable", "🍅", ["방울토마토", "대추방울토마토"], "토마토는 착과와 과실 비대기 수분 균형이 중요하며 시설과 텃밭 모두에서 많이 재배됩니다. 잎색, 열과, 통풍 상태를 함께 확인합니다.", { sowing: "2~4월 육묘", transplant: "4~5월 정식", harvest: "6~10월 수확" }],
    ["cucumber", "오이", "fruit_vegetable", "🥒", ["취청오이", "백다다기"], "오이는 생육이 빠르고 수분 요구가 큰 과채류입니다. 고온기 시듦, 잎마름, 통풍과 관수 간격을 함께 확인합니다.", { sowing: "3~4월 육묘", transplant: "4~6월 정식", harvest: "6~9월 수확" }],
    ["watermelon", "수박", "fruit_vegetable", "🍉", ["애플수박"], "수박은 착과 후 과실 비대와 수분 관리가 중요한 작물입니다. 배수, 일조, 과실 갈라짐 여부를 함께 확인합니다.", { sowing: "2~4월 육묘", transplant: "4~5월 정식", harvest: "7~8월 수확" }],
    ["korean-melon", "참외", "fruit_vegetable", "🍈", ["성주참외"], "참외는 시설 재배 비중이 높고 온습도와 착과 관리가 중요합니다. 과실 비대기 관수, 통풍, 일조 조건을 확인합니다.", { sowing: "12~2월 육묘", transplant: "2~3월 정식", harvest: "4~8월 수확" }],
    ["cabbage", "배추", "leaf_vegetable", "🥬", ["김장배추", "봄배추"], "배추는 정식 후 초기 활착과 결구기 물관리가 중요한 엽채류입니다. 고온기 추대, 잎마름, 배수 상태를 함께 확인합니다.", { sowing: "봄·여름·가을 파종", transplant: "작형별 정식", harvest: "봄·가을 중심 수확" }],
    ["radish", "무", "root_vegetable", "🥕", ["가을무", "열무", "총각무"], "무는 파종 후 초기 생육과 뿌리 비대기 수분 균형이 중요합니다. 갈라짐, 생육 지연, 토양 배수 상태를 확인합니다.", { sowing: "봄·가을 파종", transplant: "직파 중심", harvest: "파종 후 작형별 수확" }],
    ["lettuce", "상추", "leaf_vegetable", "🥬", ["청상추", "적상추"], "상추는 텃밭과 화분에서도 많이 재배되는 엽채류입니다. 고온기 추대와 잎끝 마름, 물관리와 통풍을 확인합니다.", { sowing: "봄·가을 파종", transplant: "육묘 시 정식", harvest: "생육 후 순차 수확" }],
    ["garlic", "마늘", "bulb_vegetable", "🧄", ["한지형마늘", "난지형마늘"], "마늘은 월동 후 잎마름과 구 비대기 관리가 중요한 인경채류입니다. 배수, 웃거름, 수확 후 건조 상태를 확인합니다.", { sowing: "9~11월 파종", transplant: "쪽 파종 중심", harvest: "5~6월 수확" }],
    ["onion", "양파", "bulb_vegetable", "🧅", ["조생양파", "중만생양파"], "양파는 육묘와 월동, 구 비대기 수분 관리가 중요한 작물입니다. 잎 쓰러짐 시기와 건조 상태를 함께 확인합니다.", { sowing: "8~9월 파종", transplant: "10~11월 정식", harvest: "5~6월 수확" }],
    ["green-onion", "대파", "leaf_vegetable", "🌿", ["파", "쪽파"], "대파는 흰 줄기 형성과 토양 수분 관리가 중요한 엽채류입니다. 잎마름, 배수, 북주기 여부를 확인합니다.", { sowing: "봄·가을 파종", transplant: "육묘 후 정식 가능", harvest: "연중 작형별 수확" }],
    ["potato", "감자", "root_vegetable", "🥔", ["봄감자", "가을감자"], "감자는 싹틔우기와 북주기, 괴경 비대기 수분 관리가 중요합니다. 배수 불량과 표면 갈라짐을 함께 확인합니다.", { sowing: "3~4월 또는 8월 파종", transplant: "씨감자 파종", harvest: "6~7월 또는 10월 수확" }],
    ["sweet-potato", "고구마", "root_vegetable", "🍠", ["밤고구마", "호박고구마"], "고구마는 삽식 후 활착과 덩이뿌리 비대기 관리가 중요합니다. 과습, 배수, 수확 후 큐어링을 확인합니다.", { sowing: "5~6월 삽식", transplant: "순 정식", harvest: "9~10월 수확" }],
    ["soybean", "콩", "bean", "🫘", ["대두", "서리태", "백태"], "콩은 개화기와 꼬투리 형성기 수분 관리가 중요한 두류입니다. 쓰러짐, 잎색 변화, 수확 후 건조 상태를 확인합니다.", { sowing: "5~6월 파종", transplant: "직파 중심", harvest: "10~11월 수확" }],
    ["corn", "옥수수", "grain", "🌽", ["찰옥수수", "단옥수수"], "옥수수는 초기 생육과 출수 전후 수분 관리가 중요한 곡류입니다. 쓰러짐, 수분 부족, 수확 적기를 함께 확인합니다.", { sowing: "4~5월 파종", transplant: "직파 또는 육묘", harvest: "7~9월 수확" }],
    ["apple", "사과", "fruit_tree", "🍎", ["부사", "홍로"], "사과는 개화, 착과, 과실 비대와 수확 전 품질 관리가 이어지는 과수입니다. 저온, 강풍, 일조 부족을 함께 확인합니다.", { sowing: "묘목 식재는 휴면기 중심", transplant: "봄 또는 가을 식재", harvest: "8~11월 품종별 수확" }],
    ["pear", "배", "fruit_tree", "🍐", ["신고배", "황금배"], "배는 개화기 저온과 착과 후 과실 비대 관리가 중요한 과수입니다. 봉지 씌우기 전후 과실 상태를 확인합니다.", { sowing: "묘목 식재는 휴면기 중심", transplant: "봄 또는 가을 식재", harvest: "8~10월 품종별 수확" }],
    ["peach", "복숭아", "fruit_tree", "🍑", ["황도", "백도"], "복숭아는 개화기 저온, 착과 관리, 수확 전 과실 상태 확인이 중요한 과수입니다. 과습과 강풍 영향을 함께 확인합니다.", { sowing: "묘목 식재는 휴면기 중심", transplant: "봄 또는 가을 식재", harvest: "6~9월 품종별 수확" }],
    ["grape", "포도", "fruit_tree", "🍇", ["샤인머스캣", "캠벨"], "포도는 새순 관리, 송이 관리, 착색과 당도 형성 흐름을 확인하는 과수입니다. 시설 여부에 따라 온습도 관리가 달라집니다.", { sowing: "묘목 식재는 휴면기 중심", transplant: "봄 또는 가을 식재", harvest: "8~10월 품종별 수확" }],
    ["citrus", "감귤", "fruit_tree", "🍊", ["귤", "만감류"], "감귤은 착과, 비대, 착색기 기상과 과실 상태를 함께 확인하는 과수입니다. 겨울 저온과 과습 관리를 주의합니다.", { sowing: "묘목 식재는 봄 중심", transplant: "봄 식재", harvest: "10~2월 작형별 수확" }],
    ["blueberry", "블루베리", "fruit_tree", "🫐", ["블루베리"], "블루베리는 산성 토양, 수분 균형, 착과와 수확 후 가지 관리가 중요한 과수입니다. 화분 재배 시 배수와 토양 산도를 함께 확인합니다.", { sowing: "묘목 식재는 봄·가을", transplant: "화분 또는 노지 식재", harvest: "6~8월 수확" }]
  ];

  const representativeImageTargets = {
    rice: { alt: "벼 재배 대표 참고 이미지", file: "rice-ai.png" },
    pepper: { alt: "고추 재배 대표 참고 이미지", file: "pepper-ai.png" },
    strawberry: { alt: "딸기 재배 대표 참고 이미지", file: "strawberry-ai.png" },
    tomato: { alt: "토마토 재배 대표 참고 이미지", file: "tomato-ai.png" },
    cucumber: { alt: "오이 재배 대표 참고 이미지", file: "cucumber-ai.png" },
    watermelon: { alt: "수박 재배 대표 참고 이미지", file: "watermelon-ai.png" },
    "korean-melon": { alt: "참외 재배 대표 참고 이미지", file: "melon-ai.png" },
    cabbage: { alt: "배추 재배 대표 참고 이미지", file: "cabbage-ai.png" },
    radish: { alt: "무 재배 대표 참고 이미지", file: "radish-ai.png" },
    lettuce: { alt: "상추 재배 대표 참고 이미지", file: "lettuce-ai.png" },
    garlic: { alt: "마늘 재배 대표 참고 이미지", file: "garlic-ai.png" },
    onion: { alt: "양파 재배 대표 참고 이미지", file: "onion-ai.png" },
    "green-onion": { alt: "대파 재배 대표 참고 이미지", file: "greenonion-ai.png" },
    potato: { alt: "감자 재배 대표 참고 이미지", file: "potato-ai.png" },
    "sweet-potato": { alt: "고구마 재배 대표 참고 이미지", file: "sweetpotato-ai.png" },
    soybean: { alt: "콩 재배 대표 참고 이미지", file: "soybean-ai.png" },
    corn: { alt: "옥수수 재배 대표 참고 이미지", file: "corn-ai.png" },
    apple: { alt: "사과 재배 대표 참고 이미지", file: "apple-ai.png" },
    pear: { alt: "배 재배 대표 참고 이미지", file: "pear-ai.png" },
    peach: { alt: "복숭아 재배 대표 참고 이미지", file: "peach-ai.png" },
    grape: { alt: "포도 재배 대표 참고 이미지", file: "grape-ai.png" },
    citrus: { alt: "감귤 재배 대표 참고 이미지", file: "tangerine-ai.png" },
    blueberry: { alt: "블루베리 재배 대표 참고 이미지", file: "blueberry-ai.png" }
  };

  const growthStageGroupImageTargets = {
    rice: "crop-growth-stages-core-01-ai.png",
    pepper: "crop-growth-stages-core-01-ai.png",
    strawberry: "crop-growth-stages-core-01-ai.png",
    apple: "crop-growth-stages-core-01-ai.png",
    pear: "crop-growth-stages-core-01-ai.png",
    peach: "crop-growth-stages-core-01-ai.png",
    grape: "crop-growth-stages-core-01-ai.png",
    citrus: "crop-growth-stages-core-01-ai.png",
    tomato: "crop-growth-stages-core-02-ai.png",
    watermelon: "crop-growth-stages-core-02-ai.png",
    "korean-melon": "crop-growth-stages-core-02-ai.png",
    cucumber: "crop-growth-stages-core-02-ai.png",
    eggplant: "crop-growth-stages-core-02-ai.png",
    cabbage: "crop-growth-stages-core-02-ai.png",
    radish: "crop-growth-stages-core-02-ai.png",
    "green-onion": "crop-growth-stages-core-02-ai.png",
    garlic: "crop-growth-stages-core-03-ai.png",
    onion: "crop-growth-stages-core-03-ai.png",
    soybean: "crop-growth-stages-core-03-ai.png",
    corn: "crop-growth-stages-core-03-ai.png",
    potato: "crop-growth-stages-core-03-ai.png",
    "sweet-potato": "crop-growth-stages-core-03-ai.png",
    perilla: "crop-growth-stages-core-03-ai.png"
  };

  const growthStageImageTargets = {
    rice: "rice-stages-ai.png",
    pepper: "pepper-stages-ai.png",
    strawberry: "strawberry-stages-ai.png",
    apple: "apple-stages-ai.png",
    pear: "pear-stages-ai.png",
    peach: "peach-stages-ai.png",
    grape: "grape-stages-ai.png",
    citrus: "tangerine-stages-ai.png",
    tomato: "tomato-stages-ai.png",
    watermelon: "watermelon-stages-ai.png",
    "korean-melon": "melon-stages-ai.png",
    cucumber: "cucumber-stages-ai.png",
    eggplant: "eggplant-stages-ai.png",
    cabbage: "cabbage-stages-ai.png",
    radish: "radish-stages-ai.png",
    "green-onion": "greenonion-stages-ai.png",
    garlic: "garlic-stages-ai.png",
    onion: "onion-stages-ai.png",
    soybean: "soybean-stages-ai.png",
    corn: "corn-stages-ai.png",
    potato: "potato-stages-ai.png",
    "sweet-potato": "sweetpotato-stages-ai.png",
    perilla: "perilla-stages-ai.png"
  };

  const growthStageStepLabels = [
    "\uC721\uBB18/\uCD08\uAE30",
    "\uC0DD\uC721\uAE30",
    "\uAC1C\uD654\u00B7\uACB0\uC2E4",
    "\uC218\uD655\uAE30"
  ];

  const marketPriceCropIds = new Set([
    "pepper", "strawberry", "tomato", "cucumber", "watermelon", "korean-melon",
    "cabbage", "radish", "lettuce", "garlic", "onion", "green-onion",
    "potato", "sweet-potato", "apple", "pear", "peach", "grape", "citrus"
  ]);

  const facilityVegetableCropIds = new Set([
    "pepper", "strawberry", "tomato", "cucumber", "watermelon", "korean-melon"
  ]);

  const nongsaroCropIds = new Set(coreIds);

  const regionOptions = [
    { value: "", label: "지역 미선택", group: "national" },
    { value: "seoul", label: "서울특별시", group: "central" },
    { value: "busan", label: "부산광역시", group: "southern" },
    { value: "daegu", label: "대구광역시", group: "southern" },
    { value: "incheon", label: "인천광역시", group: "central" },
    { value: "gwangju", label: "광주광역시", group: "southern" },
    { value: "daejeon", label: "대전광역시", group: "central" },
    { value: "ulsan", label: "울산광역시", group: "southern" },
    { value: "sejong", label: "세종특별자치시", group: "central" },
    { value: "gyeonggi", label: "경기도", group: "central" },
    { value: "gangwon", label: "강원특별자치도", group: "highland" },
    { value: "chungbuk", label: "충청북도", group: "central" },
    { value: "chungnam", label: "충청남도", group: "central" },
    { value: "jeonbuk", label: "전북특별자치도", group: "southern" },
    { value: "jeonnam", label: "전라남도", group: "southern" },
    { value: "gyeongbuk", label: "경상북도", group: "southern" },
    { value: "gyeongnam", label: "경상남도", group: "southern" },
    { value: "jeju", label: "제주특별자치도", group: "jeju" }
  ];

  const regionGroups = {
    national: {
      label: "전국 평균",
      shiftNote: "지역을 선택하지 않은 전국 평균 참고정보입니다.",
      cautions: ["지역별 기온 차이", "작형별 시기 차이", "농업날씨 확인"]
    },
    central: {
      label: "중부권",
      shiftNote: "남부권보다 파종·정식·수확이 다소 늦어질 수 있습니다.",
      cautions: ["늦서리", "일교차", "장마 전 배수"]
    },
    southern: {
      label: "남부권",
      shiftNote: "중부권보다 파종·정식·수확이 다소 빠를 수 있습니다.",
      cautions: ["고온", "장마", "습도"]
    },
    jeju: {
      label: "제주권",
      shiftNote: "해양성 기후 영향으로 노지 재배 시기가 일부 달라질 수 있습니다.",
      cautions: ["강풍", "습도", "태풍"]
    },
    highland: {
      label: "강원권·고랭지 참고",
      shiftNote: "고랭지·산간 작형은 평지와 재배시기가 크게 다를 수 있습니다.",
      cautions: ["저온", "서리", "일교차"]
    }
  };

  const cultivationOptions = {
    openField: { label: "노지", note: "기온과 강수, 서리 영향을 직접 받으므로 지역별 차이가 큽니다." },
    greenhouse: { label: "시설재배", note: "시설 내 온습도 관리에 따라 노지보다 재배시기가 앞당겨지거나 길어질 수 있습니다." },
    garden: { label: "텃밭", note: "소규모 재배는 배수, 햇빛, 물관리 차이가 큽니다." },
    pot: { label: "화분·베란다", note: "흙 양과 통풍이 제한되므로 과습과 일조 부족을 확인해야 합니다." },
    orchard: { label: "과수원", note: "개화, 착과, 비대, 수확 시기가 지역 기상과 품종에 따라 달라집니다." },
    smartFarm: { label: "스마트팜", note: "센서와 시설 제어 값에 따라 노지보다 작기가 길어질 수 있습니다." }
  };

  const cropCultivationTypes = {
    rice: ["openField"],
    pepper: ["openField", "garden", "greenhouse"],
    strawberry: ["greenhouse", "garden", "smartFarm"],
    tomato: ["openField", "greenhouse", "garden", "smartFarm"],
    cucumber: ["openField", "greenhouse", "garden", "smartFarm"],
    watermelon: ["openField", "greenhouse", "garden"],
    "korean-melon": ["greenhouse", "openField", "garden"],
    cabbage: ["openField", "garden", "greenhouse"],
    radish: ["openField", "garden"],
    lettuce: ["openField", "greenhouse", "garden", "pot", "smartFarm"],
    garlic: ["openField", "garden"],
    onion: ["openField", "garden"],
    "green-onion": ["openField", "greenhouse", "garden", "pot"],
    potato: ["openField", "garden"],
    "sweet-potato": ["openField", "garden"],
    soybean: ["openField", "garden"],
    corn: ["openField", "garden"],
    apple: ["orchard"],
    pear: ["orchard"],
    peach: ["orchard"],
    grape: ["orchard", "greenhouse"],
    citrus: ["orchard", "greenhouse"],
    blueberry: ["orchard", "garden", "pot"]
  };


  const core = cropRows.map(([id, name, categoryKey, icon, aliases, summary, season], index) => {
    const category = categoryLabels[categoryKey] || categoryKey;
    const detail = detailByCategory(categoryKey, name);
    const monthlyCalendar = calendarForRegional(categoryKey, name);
    return {
      id, name, category, icon, aliases, summary, type: "core",
      displayOrder: index + 1, guideLevel: "detailed", calendarLevel: "detailed",
      growingTypes: detail.growingTypes,
      season: { ...season, note: "재배 시기는 지역, 품종, 시설 여부와 그해 기상 조건에 따라 달라질 수 있습니다." },
      growthStages: detail.growthStages,
      carePoints: detail.carePoints,
      commonProblems: detail.commonProblems,
      weatherCheckpoints: detail.weatherCheckpoints,
      relatedInputs: detail.relatedInputs,
      monthlyCalendar,
      publicDataConnections: publicDataConnectionsFor(id, name, categoryKey),
      marketPriceReference: marketPriceReferenceFor(id, name),
      facilityVegetableReference: facilityVegetableReferenceFor(id, name),
      availableCultivationTypes: cultivationTypesFor(id, categoryKey),
      regionAdjustments: regionAdjustmentsFor(id),
      cultivationAdjustments: cultivationAdjustmentsFor(id),
      localExtensionSources: localExtensionSourcesFor(name),
      officialSources: [],
      officialImages: officialImagePlaceholders(name),
      representativeImage: representativeImageFor(id, name),
      growthStageGroupImage: growthStageGroupImageFor(id, name),
      growthStageImage: growthStageImageFor(id, name),
      growthStageImages: growthStageStepImagesFor(id, name),
      contentStatus: "official-review-needed",
      officialImageUrl: "", officialImageSource: "", officialImageLicenseNote: "", officialImageStatus: "pending",
      stages: detail.growthStages.map(stage => `${stage.name}: ${stage.points.join(" ")}`),
      managementPoints: detail.carePoints.map(point => `${point.name}: ${point.text}`),
      weatherPoints: detail.weatherCheckpoints,
      materials: detail.relatedInputs
    };
  });

  const basicNames = [
    ["eggplant","가지","과채류","🍆"],["pumpkin","호박","과채류","🎃"],["zucchini","애호박","과채류","🥒"],["sweet-pumpkin","단호박","과채류","🎃"],
    ["cabbage-round","양배추","엽채류","🥬"],["broccoli","브로콜리","엽채류","🥦"],["cauliflower","콜리플라워","엽채류","🥦"],["spinach","시금치","엽채류","🥬"],
    ["crown-daisy","쑥갓","엽채류","🌿"],["perilla-leaf","깻잎","엽채류","🌿"],["chives","부추","엽채류","🌿"],["water-celery","미나리","엽채류","🌿"],
    ["young-radish","열무","엽채류","🥬"],["eolgari","얼갈이배추","엽채류","🥬"],["carrot","당근","근채류","🥕"],["burdock","우엉","근채류","🥕"],
    ["taro","토란","근채류","🌿"],["ginger","생강","인경채류","🫚"],["perilla","들깨","특용작물","🌿"],["sesame","참깨","특용작물","🌿"],
    ["red-bean","팥","두류","🫘"],["mung-bean","녹두","두류","🫘"],["barley","보리","곡류","🌾"],["wheat","밀","곡류","🌾"],
    ["persimmon","감","과수","🍅"],["plum","자두","과수","🍑"],["maesil","매실","과수","🟢"],["apricot","살구","과수","🍑"],
    ["cherry","체리","과수","🍒"],["kiwi","키위","과수","🥝"],["fig","무화과","과수","🟣"],["cham-darae","참다래","과수","🥝"],
    ["chestnut","밤","과수","🌰"],["jujube","대추","과수","🟤"],["ginseng","인삼","약용작물","🌿"],["deodeok","더덕","약용작물","🌿"],
    ["balloon-flower-root","도라지","약용작물","🌿"],["medicinal-crops","약용작물","약용작물","🌿"],["chrysanthemum","국화","화훼","🌼"],["rose","장미","화훼","🌹"],
    ["carnation","카네이션","화훼","🌸"],["cymbidium","심비디움","화훼","🌺"],["succulent","다육식물","실내식물","🪴"],["monstera","몬스테라","실내식물","🌿"],
    ["stuckyi","스투키","실내식물","🪴"],["sansevieria","산세베리아","실내식물","🪴"],["rubber-tree","고무나무","실내식물","🌳"],["basil","바질","허브","🌿"],
    ["rosemary","로즈마리","허브","🌿"],["mint","민트","허브","🌿"]
  ];

  const basic = basicNames.map(([id, name, category, icon]) => ({
    id, name, category, icon, aliases: [name], type: "basic",
    guideLevel: "basic", calendarLevel: "basic",
    summary: `${name}은 지역, 품종, 시설 여부에 따라 재배 시기와 관리 방법이 달라질 수 있는 ${category} 작물입니다.`,
    basicNote: "현재 이 작물은 기본 정보만 제공 중입니다. 공공기관 재배자료와 지역별 재배달력은 순차적으로 보강 예정입니다.",
    officialSources: [], officialImages: officialImagePlaceholders(name), contentStatus: "official-review-needed",
    publicDataConnections: basicPublicDataConnectionsFor(id, category),
    representativeImage: null,
    growthStageGroupImage: growthStageGroupImageFor(id, name),
    growthStageImage: growthStageImageFor(id, name),
    growthStageImages: growthStageStepImagesFor(id, name),
    officialImageUrl: "", officialImageSource: "", officialImageLicenseNote: "", officialImageStatus: "pending"
  }));

  const all = [...core, ...basic];

  function detailByCategory(categoryKey, cropName) {
    const base = {
      growingTypes: ["노지: 강수와 고온, 배수 상태를 함께 확인합니다.", "시설: 환기, 습도, 관수 간격을 함께 확인합니다.", "텃밭: 토양 배수와 일조 시간을 우선 확인합니다.", "화분/베란다: 용기 배수와 과습 여부를 자주 확인합니다."],
      growthStages: [
        { name: "파종/육묘", period: "재배 초기", points: ["종자나 묘 상태를 확인합니다.", "상토 수분과 온도를 과하지 않게 유지합니다."] },
        { name: "정식/초기 활착", period: "정식 직후", points: ["뿌리 활착과 시듦 여부를 확인합니다.", "강한 햇빛이나 저온 스트레스에 주의합니다."] },
        { name: "생육기", period: "줄기·잎 생장기", points: ["물관리와 통풍 상태를 확인합니다.", "잎색 변화와 생육 지연을 기록합니다."] },
        { name: "개화/착과", period: "꽃·열매 형성기", points: ["고온과 과습을 함께 확인합니다.", "착과 상태와 낙화 여부를 살핍니다."] },
        { name: "수확기", period: "수확 전후", points: ["수확 적기와 품질 변화를 확인합니다.", "작업 전후 공식자료와 안전 기준을 함께 봅니다."] }
      ],
      carePoints: [
        { name: "물관리", text: "겉흙과 뿌리 주변 수분을 함께 보고 과습과 건조가 반복되지 않게 합니다." },
        { name: "온도", text: "고온기와 저온기에는 생육 지연, 시듦, 잎색 변화를 함께 확인합니다." },
        { name: "햇빛", text: "일조 부족 시 웃자람이나 착과 불량이 생길 수 있어 위치와 차광 상태를 확인합니다." },
        { name: "토양/상토", text: "배수성과 통기성을 우선 확인하고 염류 축적이나 굳은 토양을 살핍니다." },
        { name: "비료/영양", text: "생육 단계별 필요량이 다르므로 과다 시비보다 생육 상태 기록을 우선합니다." }
      ],
      commonProblems: ["잎마름", "잎노랑", "잎말림", "시들음", "곰팡이", "생육불량"],
      weatherCheckpoints: ["고온 시 수분 스트레스 확인", "저온 시 활착 지연 확인", "장마·과습 시 배수와 통풍 확인", "강풍 뒤 줄기와 잎 손상 확인", "일조 부족 시 웃자람 확인"],
      relatedInputs: ["상토", "종자/묘", "비료", "관수자재", "시설자재", "작물보호 공식정보 확인"]
    };
    if (categoryKey === "fruit_tree") {
      base.growingTypes = ["노지 과원: 저온, 강풍, 강수 영향을 함께 확인합니다.", "시설/비가림: 환기와 습도, 병해충 확인을 병행합니다.", "텃밭 과수: 수형과 배수, 일조 조건을 확인합니다.", "화분 재배: 용기 크기와 배수, 뿌리 상태를 확인합니다."];
      base.growthStages = [
        { name: "휴면/전정", period: "겨울~초봄", points: ["가지 배치와 수형을 확인합니다.", "동해 흔적과 상처 부위를 살핍니다."] },
        { name: "개화", period: "봄", points: ["저온과 강풍을 확인합니다.", "꽃 상태와 착과 가능성을 기록합니다."] },
        { name: "착과/비대", period: "봄~여름", points: ["열매 비대와 잎 상태를 확인합니다.", "과습과 일조 부족 여부를 봅니다."] },
        { name: "착색/수확", period: "여름~가을", points: ["품종별 수확 시기와 착색 상태를 확인합니다.", "수확 전 기상 변화를 함께 봅니다."] }
      ];
      base.relatedInputs = ["전정 도구", "지주·유인 자재", "관수자재", "토양개량 참고자료", "작물보호 공식정보 확인"];
    }
    if (categoryKey === "grain" || categoryKey === "bean") {
      base.growingTypes = ["노지: 강수와 쓰러짐, 토양 수분을 확인합니다.", "논/밭 작형: 물관리 방식과 배수 조건을 구분합니다.", "텃밭: 파종 간격과 잡초 관리, 지주 필요 여부를 확인합니다.", "화분 재배: 깊이와 배수 한계를 고려합니다."];
      base.commonProblems = ["잎색 변화", "시들음", "쓰러짐", "생육불량", "수분 스트레스"];
    }
    if (categoryKey === "leaf_vegetable") {
      base.commonProblems = ["잎마름", "잎노랑", "추대", "시들음", "곰팡이", "생육불량"];
    }
    if (categoryKey === "root_vegetable" || categoryKey === "bulb_vegetable") {
      base.commonProblems = ["뿌리 갈라짐", "잎마름", "잎노랑", "시들음", "과습", "생육불량"];
    }
    return base;
  }

  function officialImagePlaceholders(cropName) {
    return [{
      title: `${cropName} 공식 이미지 확인 예정`,
      url: "",
      sourceName: "",
      sourceUrl: "",
      licenseType: "",
      licenseNote: "공공누리 유형과 사용 조건 확인 예정",
      usageStatus: "pending",
      caption: "공식 사진 확인 예정"
    }];
  }

  function representativeImageFor(id, cropName) {
    const target = representativeImageTargets[id];
    if (!target) return null;
    return {
      type: "ai-generated",
      url: `/static/crops/${target.file}`,
      alt: target.alt,
      caption: `AI로 생성한 ${cropName} 재배 참고 이미지입니다.`,
      note: "실제 품종, 생육상태, 재배환경은 다를 수 있습니다."
    };
  }


  function growthStageGroupImageFor(id, cropName) {
    const file = growthStageGroupImageTargets[id];
    if (!file) return null;
    return {
      type: "ai-generated",
      url: `/static/crops/stages/${file}`,
      alt: `${cropName} \uC0DD\uC721\uB2E8\uACC4 \uBB36\uC74C \uCC38\uACE0 \uC774\uBBF8\uC9C0`,
      caption: "\u0041\u0049\uB85C \uC0DD\uC131\uD55C \uC0DD\uC721\uB2E8\uACC4 \uCC38\uACE0 \uC774\uBBF8\uC9C0\uC785\uB2C8\uB2E4.",
      note: "\uC791\uBB3C\uBCC4 \uC2E4\uC81C \uC0DD\uC721\uC740 \uD488\uC885, \uC9C0\uC5ED, \uC791\uD615\uC5D0 \uB530\uB77C \uB2EC\uB77C\uC9C8 \uC218 \uC788\uC2B5\uB2C8\uB2E4."
    };
  }

  function growthStageImageFor(id, cropName) {
    const file = growthStageImageTargets[id];
    if (!file) return null;
    return {
      type: "ai-generated",
      url: `/static/crops/stages/individual/${file}`,
      alt: `${cropName} \uC0DD\uC721\uB2E8\uACC4 \uCC38\uACE0 \uC774\uBBF8\uC9C0`,
      caption: `\u0041\u0049\uB85C \uC0DD\uC131\uD55C ${cropName} \uC0DD\uC721\uB2E8\uACC4 \uCC38\uACE0 \uC774\uBBF8\uC9C0\uC785\uB2C8\uB2E4.`,
      note: "\uC2E4\uC81C \uD488\uC885, \uC0DD\uC721\uC0C1\uD0DC, \uC7AC\uBC30\uD658\uACBD\uC740 \uB2E4\uB97C \uC218 \uC788\uC2B5\uB2C8\uB2E4."
    };
  }

  function growthStageStepImagesFor(id, cropName) {
    const file = growthStageImageTargets[id];
    if (!file) return [];
    const stem = file.replace("-stages-ai.png", "");
    return growthStageStepLabels.map((stage, index) => ({
      type: "ai-generated",
      stage,
      url: `/static/crops/stages/steps/${stem}-stage-${index + 1}-ai.png`,
      alt: `${cropName} ${stage} \uCC38\uACE0 \uC774\uBBF8\uC9C0`,
      caption: "\u0041\u0049\uB85C \uC0DD\uC131\uD55C \uC0DD\uC721\uB2E8\uACC4 \uCC38\uACE0 \uC774\uBBF8\uC9C0\uC785\uB2C8\uB2E4."
    }));
  }

  function publicDataConnectionsFor(id, cropName, categoryKey) {
    const rows = [
      {
        type: "weather",
        label: "\uB18D\uC5C5\uB0A0\uC528 \uD655\uC778",
        source: "KMA",
        endpoint: "/api/weather/forecast",
        status: "active",
        note: "\uC9C0\uC5ED\uBCC4 \uAE30\uC628, \uAC15\uC218, \uBC14\uB78C \uC0C1\uD0DC\uB97C \uD568\uAED8 \uD655\uC778\uD558\uB294 \uCC38\uACE0\uC790\uB8CC\uC785\uB2C8\uB2E4."
      },
      {
        type: "public-info",
        label: "\uACF5\uACF5\uC815\uBCF4 \uD655\uC778",
        source: "PUBLIC_AGRI_INFO",
        endpoint: "/api/agri/public-info",
        status: "active",
        note: "\uC791\uBB3C\uBA85\uACFC \uC99D\uC0C1 \uD0A4\uC6CC\uB4DC\uB85C \uACF5\uACF5\uC815\uBCF4 \uD655\uC778 \uACBD\uB85C\uB97C \uC5F0\uACB0\uD569\uB2C8\uB2E4."
      }
    ];
    rows.push({
      type: "ncpms",
      label: "\uBCD1\uD574\uCDA9 \uC815\uBCF4 \uD655\uC778",
      source: "NCPMS",
      endpoint: "/api/ncpms/diseases",
      status: "active",
      note: "\uC791\uBB3C\uBA85 \uAE30\uC900 \uACF5\uACF5 \uBCD1\uD574\uCDA9 \uC815\uBCF4 \uAC80\uC0C9\uC744 \uC5F0\uACB0\uD569\uB2C8\uB2E4. \uD654\uBA74\uC5D0\uC11C\uB294 \uD655\uC778\uD560 \uBB38\uC81C \uC218\uC900\uC73C\uB85C\uB9CC \uD45C\uC2DC\uD569\uB2C8\uB2E4."
    });
    rows.push({
      type: "pesticide-safety",
      label: "\uB18D\uC57D\uC548\uC804\uC0AC\uC6A9\uAE30\uC900 \uD655\uC778",
      source: "PSIS",
      endpoint: "/api/psis/pesticide-safety",
      status: "fallback",
      note: "\uD604\uC7AC Worker endpoint\uB294 \uC788\uC73C\uB098 fallback \uC751\uB2F5 \uC0C1\uD0DC\uC785\uB2C8\uB2E4. \uC791\uBB3C\uBCF4\uD638\uC81C \uC0AC\uC6A9 \uC804\uC5D0\uB294 \uB18D\uC57D\uC548\uC804\uC815\uBCF4\uC2DC\uC2A4\uD15C\uACFC \uC81C\uD488 \uB77C\uBCA8\uC758 \uB4F1\uB85D\uC815\uBCF4\u00B7\uC548\uC804\uC0AC\uC6A9\uAE30\uC900\uC744 \uD568\uAED8 \uD655\uC778\uD574\uC57C \uD569\uB2C8\uB2E4."
    });
    if (nongsaroCropIds.has(id)) {
      rows.push({
        type: "nongsaro",
        label: "\uB18D\uC0AC\uB85C \uC791\uBAA9\uBCC4 \uCC38\uACE0\uC790\uB8CC",
        source: "\uB18D\uCD0C\uC9C4\uD765\uCCAD \uB18D\uC0AC\uB85C",
        endpoint: "/api/nongsaro/service",
        status: "active",
        note: "\uD604\uC7AC Worker\uC5D0\uC11C \uB18D\uC0AC\uB85C \uC11C\uBE44\uC2A4 \uD638\uCD9C\uC774 \uAC00\uB2A5\uD55C \uC0C1\uD0DC\uC785\uB2C8\uB2E4."
      });
    }
    if (marketPriceCropIds.has(id)) {
      rows.push({
        type: "market",
        label: "\uB18D\uC0B0\uBB3C \uC2DC\uC138 \uCC38\uACE0",
        source: "KAMIS/aT",
        endpoint: "/api/kamis/prices",
        status: "active",
        note: "\uD638\uCD9C \uAC00\uB2A5\uD55C \uD488\uBAA9\uC5D0 \uD55C\uD574 \uC2DC\uC7A5 \uD750\uB984 \uCC38\uACE0\uC790\uB8CC\uB85C \uC5F0\uACB0\uD569\uB2C8\uB2E4."
      });
    }
    if (facilityVegetableCropIds.has(id) || categoryKey === "fruit_vegetable") {
      rows.push({
        type: "facility-vegetable",
        label: "\uC2DC\uC124\uCC44\uC18C \uC0DD\uC0B0\uC2E4\uC801 \uCC38\uACE0",
        source: "MAFRA",
        endpoint: "/api/mafra/facility-vegetables",
        status: "pending",
        note: "\uD604\uC7AC \uD638\uCD9C\uC740 fallback \uC0C1\uD0DC\uB77C \uBC1C\uD45C \uD654\uBA74\uC5D0\uC11C\uB294 \uC5F0\uB3D9 \uC608\uC815 \uCC38\uACE0\uC790\uB8CC\uB85C \uD45C\uC2DC\uD569\uB2C8\uB2E4."
      });
    }
    return rows;
  }

  function marketPriceReferenceFor(id, cropName) {
    if (!marketPriceCropIds.has(id)) return null;
    return {
      label: `${cropName} \uC2DC\uC138 \uCC38\uACE0 \uAC00\uB2A5 \uD488\uBAA9`,
      source: "KAMIS/aT",
      status: "active",
      note: "\uC2DC\uC7A5 \uD750\uB984 \uCC38\uACE0\uC790\uB8CC\uC774\uBA70 \uD310\uB9E4\u00B7\uAD6C\uB9E4 \uC720\uB3C4 \uBAA9\uC801\uC774 \uC544\uB2D9\uB2C8\uB2E4."
    };
  }

  function facilityVegetableReferenceFor(id, cropName) {
    if (!facilityVegetableCropIds.has(id)) return null;
    return {
      label: `${cropName} \uC2DC\uC124\uCC44\uC18C \uC790\uB8CC \uC5F0\uACB0 \uD6C4\uBCF4`,
      source: "MAFRA",
      status: "pending",
      note: "\uACF5\uACF5\uB370\uC774\uD130 \uD638\uCD9C \uC548\uC815\uD654 \uD6C4 \uC2DC\uC124\uC7AC\uBC30 \uCC38\uACE0\uC790\uB8CC\uB85C \uBCF4\uAC15 \uC608\uC815\uC785\uB2C8\uB2E4."
    };
  }

  function basicPublicDataConnectionsFor(id, category) {
    const rows = [];
    if (String(category || "").includes("\uD654\uD6FC")) {
      rows.push({
        type: "flower-price",
        label: "\uD654\uD6FC\uB958 \uC2DC\uC138\uD604\uD669 \uC5F0\uACB0 \uD6C4\uBCF4",
        source: "MAFRA",
        endpoint: "/api/mafra/flower-prices",
        status: "pending",
        note: "\uD604\uC7AC \uD638\uCD9C\uC740 fallback \uC0C1\uD0DC\uB77C \uACF5\uC2DD\uC790\uB8CC \uD655\uC778 \uD6C4 \uC5F0\uACB0 \uC608\uC815\uC785\uB2C8\uB2E4."
      });
    }
    const indoorIds = new Set(["succulent", "monstera", "stuckyi", "sansevieria", "rubber-tree", "basil", "rosemary", "mint"]);
    if (indoorIds.has(id)) {
      rows.push({
        type: "indoor-plant",
        label: "\uBC18\uB824\uC2DD\uBB3C \uAD00\uB9AC \uCC38\uACE0",
        source: "\uB0B4\uBD80 weather-crop-profiles",
        endpoint: "data/weather-crop-profiles.json",
        status: "active",
        note: "\uAD11\uB7C9, \uBB3C\uC8FC\uAE30, \uACC4\uC808\uBCC4 \uAD00\uB9AC, \uACFC\uC2B5\u00B7\uD1B5\uD48D \uCCB4\uD06C\uB97C \uC2E4\uB0B4\uC2DD\uBB3C \uCC38\uACE0\uC790\uB8CC\uB85C \uC5F0\uACB0\uD569\uB2C8\uB2E4."
      });
    }
    return rows;
  }

  function cultivationTypesFor(id, categoryKey) {
    return (cropCultivationTypes[id] || (categoryKey === "fruit_tree" ? ["orchard"] : ["openField", "garden"]))
      .map(value => ({ value, ...cultivationOptions[value] }))
      .filter(item => item.label);
  }

  function regionAdjustmentsFor(id) {
    return {
      national: regionSpecificNotes(id, "national"),
      central: regionSpecificNotes(id, "central"),
      southern: regionSpecificNotes(id, "southern"),
      jeju: regionSpecificNotes(id, "jeju"),
      highland: regionSpecificNotes(id, "highland")
    };
  }

  function cultivationAdjustmentsFor(id) {
    const result = {};
    cultivationTypesFor(id).forEach(item => {
      result[item.value] = {
        label: item.label,
        note: item.note,
        points: cultivationSpecificNotes(id, item.value)
      };
    });
    return result;
  }

  function localExtensionSourcesFor(cropName) {
    return regionOptions.filter(region => region.value).map(region => ({
      region: region.label,
      sourceName: `${region.label} 농업기술원·시군 농업기술센터`,
      url: null,
      status: "pending",
      note: `${cropName} 지역 재배자료는 공식자료 확인 후 순차 연결 예정입니다.`
    }));
  }

  function regionSpecificNotes(id, group) {
    const common = {
      national: ["지역을 선택하면 권역별 재배시기와 주의사항을 더 구체적으로 볼 수 있습니다."],
      central: ["늦서리와 일교차를 확인하고 노지 정식 시기를 보수적으로 잡습니다.", "장마 전 배수로와 지주 상태를 점검합니다."],
      southern: ["중부권보다 정식과 수확이 빠를 수 있어 고온기 관리 일정을 앞당겨 확인합니다.", "장마와 습도 변화에 대비해 배수와 통풍을 확인합니다."],
      jeju: ["강풍, 습도, 태풍 시기 영향을 함께 확인합니다.", "해양성 기후 영향으로 노지 작형 시기가 달라질 수 있습니다."],
      highland: ["저온, 일교차, 늦서리 가능성을 함께 확인합니다.", "고랭지 작형은 평지와 달라 별도 공식자료 확인이 필요합니다."]
    };
    const cropNotes = {
      pepper: {
        central: ["중부권 노지는 늦서리 이후 정식 가능성을 확인합니다.", "장마 전 배수와 지주 고정 상태를 점검합니다."],
        southern: ["남부권은 정식과 수확이 다소 빠를 수 있어 고온기 물관리 일정을 앞당겨 확인합니다."],
        highland: ["고랭지는 저온과 일교차로 초기 활착이 늦어질 수 있습니다."]
      },
      strawberry: {
        central: ["시설재배는 저온기 보온과 환기 균형을 확인합니다."],
        southern: ["고온기 육묘 관리와 시설 내 습도 관리를 함께 확인합니다."],
        jeju: ["강풍과 습도 영향을 고려해 시설 환기와 보온 상태를 확인합니다."]
      },
      rice: {
        central: ["이앙 전후 저온과 늦서리 가능성을 확인합니다."],
        southern: ["이앙과 수확이 다소 빠를 수 있어 장마 전후 물관리 일정을 확인합니다."],
        jeju: ["강풍과 태풍 시기 논물과 쓰러짐 가능성을 확인합니다."],
        highland: ["저온과 일조 부족이 육묘와 등숙에 미치는 영향을 확인합니다."]
      },
      cabbage: {
        highland: ["고랭지 작형은 여름 고온기 평지 작형과 시기가 크게 다릅니다."],
        central: ["가을 작형은 정식 전후 고온과 늦장마를 함께 확인합니다."],
        southern: ["고온기 생육과 배수 상태를 우선 확인합니다."]
      },
      radish: {
        highland: ["고랭지 작형은 평지와 파종·수확 시기가 다를 수 있습니다."],
        central: ["봄·가을 작형별 늦서리와 가을 저온을 확인합니다."],
        southern: ["고온기 파종은 생육 지연과 수분 변화를 함께 확인합니다."]
      },
      lettuce: {
        central: ["봄·가을 중심으로 추대와 저온 가능성을 함께 확인합니다."],
        southern: ["여름 고온기에는 추대와 생육불량 가능성을 더 자주 확인합니다."],
        jeju: ["바람과 습도 조건에 따라 잎마름과 통풍 상태를 확인합니다."]
      },
      garlic: {
        central: ["월동 전 활착과 봄 생육 재개 시기를 확인합니다."],
        southern: ["월동 부담은 낮을 수 있으나 봄 고온과 건조를 함께 확인합니다."]
      },
      onion: {
        central: ["월동 전 뿌리 활착과 봄 생육 재개 상태를 확인합니다."],
        southern: ["초여름 수확 전 고온과 쓰러짐 시기를 확인합니다."]
      },
      citrus: {
        jeju: ["제주권 중심 작물로 강풍, 습도, 월동기 온도 변화를 함께 확인합니다."],
        southern: ["남부 해안 지역은 월동 온도와 강풍 영향을 확인합니다."],
        central: ["중부권 노지 기준으로는 공식자료 확인이 필요합니다."]
      }
    };
    const fruitTreeIds = new Set(["apple","pear","peach","grape","blueberry"]);
    if (fruitTreeIds.has(id)) {
      const fruitNotes = {
        central: ["개화기 저온과 늦서리 가능성을 확인합니다.", "수확기는 품종과 지역 기상에 따라 달라질 수 있습니다."],
        southern: ["개화와 수확이 다소 빠를 수 있어 고온기 수분 관리와 착색 상태를 확인합니다."],
        highland: ["개화 지연과 일교차 영향을 함께 확인합니다."],
        jeju: ["강풍과 습도 조건을 함께 확인합니다."]
      };
      return [...(common[group] || common.national), ...(fruitNotes[group] || [])];
    }
    return [...(common[group] || common.national), ...((cropNotes[id] && cropNotes[id][group]) || [])];
  }

  function cultivationSpecificNotes(id, value) {
    const base = {
      openField: ["기온, 강수, 바람 변화를 직접 받으므로 농업날씨를 함께 확인합니다."],
      greenhouse: ["시설 내부 온습도, 환기, 관수 간격을 기록합니다."],
      garden: ["소규모 재배지는 햇빛, 배수, 물관리 편차를 확인합니다."],
      pot: ["화분은 흙 양이 적어 과습과 건조가 빠르게 나타날 수 있습니다."],
      orchard: ["전정, 개화, 착과, 비대, 수확 후 관리 일정을 분리해 확인합니다."],
      smartFarm: ["센서 값과 실제 잎·과실 상태를 함께 확인합니다."]
    };
    const special = {
      strawberry: { greenhouse: ["여름 육묘, 가을 정식, 겨울~봄 수확 흐름을 기준으로 확인합니다."] },
      lettuce: { pot: ["베란다 재배는 일조 부족과 통풍 부족을 먼저 확인합니다."] },
      citrus: { orchard: ["월동기 온도와 강풍 영향을 함께 확인합니다."] }
    };
    return [...(base[value] || []), ...((special[id] && special[id][value]) || [])];
  }

  function computeRegionalContext(crop, regionValue = "", cultivationValue = "") {
    const region = regionOptions.find(item => item.value === regionValue) || regionOptions[0];
    const group = region.group || "national";
    const groupInfo = regionGroups[group] || regionGroups.national;
    const available = crop.availableCultivationTypes || [];
    const cultivation = available.find(item => item.value === cultivationValue) || available[0] || { value: "", label: "재배유형 미선택", note: "재배유형을 선택하면 관리 포인트를 더 구체적으로 볼 수 있습니다." };
    const regionPoints = (crop.regionAdjustments && crop.regionAdjustments[group]) || regionSpecificNotes(crop.id, group);
    const cultivationInfo = (crop.cultivationAdjustments && crop.cultivationAdjustments[cultivation.value]) || { label: cultivation.label, note: cultivation.note, points: [] };
    const now = new Date();
    const monthNumber = now.getMonth() + 1;
    const months = crop.monthlyCalendar || [];
    const currentMonth = months.find(item => String(item.month).replace("월", "") === String(monthNumber)) || null;
    const nextMonthNumber = monthNumber === 12 ? 1 : monthNumber + 1;
    const nextMonth = months.find(item => String(item.month).replace("월", "") === String(nextMonthNumber)) || null;
    const weatherTasks = [
      ...(groupInfo.cautions || []),
      ...((crop.weatherCheckpoints || []).slice(0, 2))
    ];
    return {
      cropName: crop.name,
      region,
      group,
      groupLabel: groupInfo.label,
      cultivation,
      shiftNote: groupInfo.shiftNote,
      cautions: groupInfo.cautions || [],
      regionPoints,
      cultivationPoints: cultivationInfo.points || [],
      cultivationNote: cultivationInfo.note || cultivation.note,
      currentMonth,
      nextMonth,
      monthNumber,
      weatherTasks,
      extensionSource: (crop.localExtensionSources || []).find(item => item.region === region.label) || null
    };
  }

  function calendarForRegional(categoryKey, cropName) {
    const templates = {
      grain: [
        ["1월", "종자와 재배 계획을 확인하고 전년도 기록을 정리합니다."],
        ["2월", "못자리 자재와 토양 준비 상태를 점검합니다."],
        ["3월", "파종 또는 육묘 준비를 시작하고 지역별 기온을 확인합니다."],
        ["4월", "못자리와 육묘 상태를 확인하고 저온 가능성을 살핍니다."],
        ["5월", "이앙 전후 활착과 논물 관리 상태를 확인합니다."],
        ["6월", "분얼기 생육과 물관리, 잡초 발생 여부를 점검합니다."],
        ["7월", "고온기 생육과 쓰러짐 가능성, 강풍 영향을 살핍니다."],
        ["8월", "출수와 등숙기 수분 상태, 일조 부족 여부를 확인합니다."],
        ["9월", "수확 전 품질과 기상 변화를 확인합니다."],
        ["10월", "수확과 건조 상태를 점검합니다."],
        ["11월", "수확 후 포장 정리와 다음 작기 토양 상태를 기록합니다."],
        ["12월", "다음 작기 품종과 재배 일정을 준비합니다."]
      ],
      bean: [
        ["1월", "재배 품종과 포장 계획을 정리합니다."],
        ["2월", "종자와 배수 계획을 확인합니다."],
        ["3월", "파종 전 토양 준비와 기상 흐름을 확인합니다."],
        ["4월", "파종 전 토양과 배수 상태를 확인합니다."],
        ["5월", "파종과 초기 활착을 확인합니다."],
        ["6월", "초기 생육과 잡초 관리 필요 여부를 살핍니다."],
        ["7월", "개화기 수분 상태를 확인합니다."],
        ["8월", "꼬투리 형성과 고온 스트레스를 확인합니다."],
        ["9월", "등숙 상태와 수확 전 기상 변화를 확인합니다."],
        ["10월", "수확과 건조 상태를 확인합니다."],
        ["11월", "저장 전 건조와 선별 상태를 확인합니다."],
        ["12월", "다음 작기 기록을 정리합니다."]
      ],
      fruit_vegetable: [
        ["1월", "시설 작형은 보온과 환기 상태를 확인합니다."],
        ["2월", "육묘와 파종 준비를 점검합니다."],
        ["3월", "육묘 생육과 정식 예정 포장 상태를 확인합니다."],
        ["4월", "정식 전후 활착과 저온 피해 가능성을 확인합니다."],
        ["5월", "초기 생육, 유인, 관수 간격을 점검합니다."],
        ["6월", "개화·착과와 관수 간격을 살핍니다."],
        ["7월", "고온·장마기 통풍과 배수를 확인합니다."],
        ["8월", "수확과 후기 생육, 과실 갈라짐 가능성을 확인합니다."],
        ["9월", "수확과 후기 생육 상태를 기록합니다."],
        ["10월", "작기 정리와 시설 환경을 점검합니다."],
        ["11월", "다음 작기 시설 보온과 배수 계획을 세웁니다."],
        ["12월", "시설 작형은 보온, 환기, 습도 변화를 확인합니다."]
      ],
      leaf_vegetable: [
        ["1월", "시설 또는 텃밭 재배 계획을 정리합니다."],
        ["2월", "봄 작형 파종과 육묘를 준비합니다."],
        ["3월", "파종 또는 정식 전 토양 수분과 배수 상태를 확인합니다."],
        ["4월", "정식 후 활착과 잎 생육을 확인합니다."],
        ["5월", "생육과 수확 가능 시기를 함께 확인합니다."],
        ["6월", "고온기 추대와 잎끝 마름을 확인합니다."],
        ["7월", "여름 작형은 차광, 통풍, 수분 변화를 확인합니다."],
        ["8월", "가을 작형 파종 전 토양을 준비합니다."],
        ["9월", "가을 작형 파종과 초기 생육을 확인합니다."],
        ["10월", "수확기 품질과 저온 변화를 확인합니다."],
        ["11월", "저온기 생육과 보온 필요 여부를 확인합니다."],
        ["12월", "다음 작기 계획과 자재를 점검합니다."]
      ],
      root_vegetable: [
        ["1월", "저장 상태와 다음 작기 계획을 확인합니다."],
        ["2월", "봄 작형 토양 준비와 배수 계획을 세웁니다."],
        ["3월", "봄 파종과 배수 상태를 확인합니다."],
        ["4월", "초기 생육과 토양 수분을 확인합니다."],
        ["5월", "뿌리 비대 전 생육 균형을 점검합니다."],
        ["6월", "뿌리 비대와 갈라짐 여부를 확인합니다."],
        ["7월", "저장 작물은 온습도와 부패 가능성을 확인합니다."],
        ["8월", "가을 작형 파종을 준비합니다."],
        ["9월", "가을 작형 초기 생육과 수분 상태를 확인합니다."],
        ["10월", "수확 전 품질과 저장성을 확인합니다."],
        ["11월", "수확 후 저장과 선별 상태를 점검합니다."],
        ["12월", "다음 작기 재배 기록을 정리합니다."]
      ],
      bulb_vegetable: [
        ["1월", "월동 상태와 저온 피해 가능성을 확인합니다."],
        ["2월", "월동 후 생육 재개 전 포장 상태를 점검합니다."],
        ["3월", "봄 생육 재개와 잎마름을 확인합니다."],
        ["4월", "구 비대 초기 물관리와 생육 균형을 확인합니다."],
        ["5월", "구 비대와 물관리 상태를 확인합니다."],
        ["6월", "수확과 건조 상태를 점검합니다."],
        ["7월", "저장 중 온습도와 부패 가능성을 확인합니다."],
        ["8월", "파종 또는 육묘 준비를 시작합니다."],
        ["9월", "파종 또는 육묘를 준비합니다."],
        ["10월", "정식과 월동 전 활착을 확인합니다."],
        ["11월", "월동 전 배수와 보온 상태를 확인합니다."],
        ["12월", "월동 중 포장 상태와 기상 변화를 살핍니다."]
      ],
      fruit_tree: [
        ["1월", "휴면기 전정과 동해 흔적을 확인합니다."],
        ["2월", "동해와 수세 상태를 점검하고 작업 계획을 정리합니다."],
        ["3월", "개화 전 수세와 저온 가능성을 확인합니다."],
        ["4월", "개화와 착과 상태를 기록합니다."],
        ["5월", "적과와 신초 생육 상태를 확인합니다."],
        ["6월", "과실 비대와 강풍·장마 영향을 확인합니다."],
        ["7월", "고온기 수분과 일조 상태를 확인합니다."],
        ["8월", "착색과 수확 전 품질 변화를 확인합니다."],
        ["9월", "수확기 품질과 기상 변화를 확인합니다."],
        ["10월", "수확 후 나무 상태와 토양 관리를 점검합니다."],
        ["11월", "낙엽 후 수세와 토양 상태를 기록합니다."],
        ["12월", "동계 전정과 다음 작기 계획을 준비합니다."]
      ]
    };
    return (templates[categoryKey] || templates.fruit_vegetable).map(([month, task]) => ({
      month,
      title: month,
      task: `${cropName}: ${task}`,
      tasks: [task, "지역, 품종, 시설 여부에 따라 시기가 달라질 수 있습니다."],
      note: "지역, 품종, 시설 여부와 그해 기상 조건에 따라 달라질 수 있는 참고자료입니다."
    }));
  }

  function calendarFor(categoryKey, cropName) {
    const templates = {
      grain: [
        ["1?","??? ?? ??? ???? ??? ??? ?????."],
        ["2?","??? ??? ?? ?? ??? ?????."],
        ["3?","?? ?? ?? ??? ???? ??? ??? ?????."],
        ["4?","???? ?? ??? ???? ?? ???? ????."],
        ["5?","?? ?? ??? ?? ?? ??? ?????."],
        ["6?","??? ??? ???, ?? ?? ??? ?????."],
        ["7?","??? ??? ??? ???, ?? ??? ????."],
        ["8?","??? ??? ?? ??, ?? ?? ??? ?????."],
        ["9?","?? ? ??? ?? ??? ?????."],
        ["10?","??? ?? ??? ?????."],
        ["11?","?? ? ?? ??? ?? ?? ?? ??? ?????."],
        ["12?","?? ?? ??? ?? ??? ?????."]
      ],
      bean: [
        ["1?","?? ??? ?? ??? ?????."],
        ["2?","??? ?? ??? ?????."],
        ["3?","?? ? ?? ??? ?? ??? ?????."],
        ["4?","?? ? ??? ?? ??? ?????."],
        ["5?","??? ?? ??? ?????."],
        ["6?","?? ??? ?? ?? ?? ??? ????."],
        ["7?","??? ?? ??? ?????."],
        ["8?","??? ??? ?? ????? ?????."],
        ["9?","?? ??? ?? ? ?? ??? ?????."],
        ["10?","??? ?? ??? ?????."],
        ["11?","?? ? ??? ?? ??? ?????."],
        ["12?","?? ?? ??? ?????."]
      ],
      fruit_vegetable: [
        ["1?","?? ??? ??? ?? ??? ?????."],
        ["2?","??? ?? ??? ?????."],
        ["3?","?? ??? ?? ?? ?? ??? ?????."],
        ["4?","?? ?? ??? ?? ?? ???? ?????."],
        ["5?","?? ??, ??, ?? ??? ?????."],
        ["6?","?????? ?? ??? ????."],
        ["7?","?????? ??? ??? ?????."],
        ["8?","??? ?? ??, ?? ??? ???? ?????."],
        ["9?","??? ?? ?? ??? ?????."],
        ["10?","?? ??? ?? ??? ?????."],
        ["11?","?? ?? ?? ??? ?? ??? ????."],
        ["12?","?? ??? ??, ??, ?? ??? ?????."]
      ],
      leaf_vegetable: [
        ["1?","?? ?? ?? ?? ??? ?????."],
        ["2?","? ?? ??? ??? ?????."],
        ["3?","?? ?? ?? ? ?? ??? ?? ??? ?????."],
        ["4?","?? ? ??? ? ??? ?????."],
        ["5?","??? ?? ?? ??? ?? ?????."],
        ["6?","??? ??? ?? ??? ?????."],
        ["7?","?? ??? ??, ??, ?? ??? ?????."],
        ["8?","?? ?? ?? ? ??? ?????."],
        ["9?","?? ?? ??? ?? ??? ?????."],
        ["10?","??? ??? ?? ??? ?????."],
        ["11?","??? ??? ?? ?? ??? ?????."],
        ["12?","?? ?? ??? ??? ?????."]
      ],
      root_vegetable: [
        ["1?","?? ??? ?? ?? ??? ?????."],
        ["2?","? ?? ?? ??? ?? ??? ????."],
        ["3?","? ??? ?? ??? ?????."],
        ["4?","?? ??? ?? ??? ?????."],
        ["5?","?? ?? ? ?? ??? ?????."],
        ["6?","?? ??? ??? ??? ?????."],
        ["7?","?? ??? ???? ?? ???? ?????."],
        ["8?","?? ?? ??? ?????."],
        ["9?","?? ?? ?? ??? ?? ??? ?????."],
        ["10?","?? ? ??? ???? ?????."],
        ["11?","?? ? ??? ?? ??? ?????."],
        ["12?","?? ?? ?? ??? ?????."]
      ],
      bulb_vegetable: [
        ["1?","?? ??? ?? ?? ???? ?????."],
        ["2?","?? ? ?? ?? ? ?? ??? ?????."],
        ["3?","? ?? ??? ???? ?????."],
        ["4?","? ?? ?? ???? ?? ??? ?????."],
        ["5?","? ??? ??? ??? ?????."],
        ["6?","??? ?? ??? ?????."],
        ["7?","?? ? ???? ?? ???? ?????."],
        ["8?","?? ?? ?? ??? ?????."],
        ["9?","?? ?? ??? ?????."],
        ["10?","??? ?? ? ??? ?????."],
        ["11?","?? ? ??? ?? ??? ?????."],
        ["12?","?? ? ?? ??? ?? ??? ????."]
      ],
      fruit_tree: [
        ["1?","??? ??? ?? ??? ?????."],
        ["2?","??? ?? ??? ???? ?? ??? ?????."],
        ["3?","?? ? ??? ?? ???? ?????."],
        ["4?","??? ?? ??? ?????."],
        ["5?","??? ?? ?? ??? ?????."],
        ["6?","?? ??? ????? ??? ?????."],
        ["7?","??? ??? ?? ??? ?????."],
        ["8?","??? ?? ? ?? ??? ?????."],
        ["9?","??? ??? ?? ??? ?????."],
        ["10?","?? ? ?? ??? ?? ??? ?????."],
        ["11?","?? ? ??? ?? ??? ?????."],
        ["12?","?? ??? ?? ?? ??? ?????."]
      ]
    };
    return (templates[categoryKey] || templates.fruit_vegetable).map(([month, task]) => ({
      month,
      title: month,
      task: `${cropName}: ${task}`,
      tasks: [task, "??, ??, ?? ??? ?? ??? ??? ? ????."],
      note: "??, ??, ?? ??? ?? ?? ??? ?? ??? ? ?? ???????."
    }));
  }

  function normalizeSearch(value) {
    return String(value || "").toLowerCase().replace(/\s+/g, "").replace(/[.,]/g, "");
  }

  function matchesCrop(crop, query) {
    const q = normalizeSearch(query);
    if (!q) return false;
    const fields = [
      crop.name, crop.category, crop.summary, crop.basicNote,
      ...(crop.aliases || []),
      ...(crop.commonProblems || []),
      ...(crop.weatherCheckpoints || []),
      ...(crop.relatedInputs || []),
      ...(crop.monthlyCalendar || []).flatMap(item => [item.month, item.title, item.task, ...(item.tasks || [])]),
      ...(crop.publicDataConnections || []).flatMap(item => [item.label, item.source, item.status, item.note]),
      ...(crop.availableCultivationTypes || []).flatMap(item => [item.label, item.note]),
      ...(crop.localExtensionSources || []).flatMap(item => [item.region, item.sourceName, item.note]),
      ...Object.values(crop.regionAdjustments || {}).flat(),
      ...Object.values(crop.cultivationAdjustments || {}).flatMap(item => [item.label, item.note, ...(item.points || [])]),
      crop.marketPriceReference?.label,
      crop.marketPriceReference?.note,
      crop.facilityVegetableReference?.label,
      crop.facilityVegetableReference?.note
    ].map(normalizeSearch);
    return fields.some(field => field.includes(q) || q.includes(field));
  }

  const calendarByCategory = {};
  core.forEach(crop => {
    if (!calendarByCategory[crop.category]) {
      calendarByCategory[crop.category] = crop.monthlyCalendar.map(item => ({ range: item.month, task: item.task }));
    }
  });

  return { core, basic, all, coreIds, calendarByCategory, matchesCrop, regionOptions, regionGroups, cultivationOptions, computeRegionalContext };
})();

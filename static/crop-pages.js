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
    apple: { alt: "사과 재배 대표 참고 이미지", file: "apple-ai.png" },
    pear: { alt: "배 재배 대표 참고 이미지", file: "pear-ai.png" },
    peach: { alt: "복숭아 재배 대표 참고 이미지", file: "peach-ai.png" }
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


  const core = cropRows.map(([id, name, categoryKey, icon, aliases, summary, season], index) => {
    const category = categoryLabels[categoryKey] || categoryKey;
    const detail = detailByCategory(categoryKey, name);
    const monthlyCalendar = calendarFor(categoryKey, name);
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
    if (!String(category || "").includes("\uD654\uD6FC")) return [];
    return [{
      type: "flower-price",
      label: "\uD654\uD6FC\uB958 \uC2DC\uC138\uD604\uD669 \uC5F0\uACB0 \uD6C4\uBCF4",
      source: "MAFRA",
      endpoint: "/api/mafra/flower-prices",
      status: "pending",
      note: "\uD604\uC7AC \uD638\uCD9C\uC740 fallback \uC0C1\uD0DC\uB77C \uACF5\uC2DD\uC790\uB8CC \uD655\uC778 \uD6C4 \uC5F0\uACB0 \uC608\uC815\uC785\uB2C8\uB2E4."
    }];
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

  return { core, basic, all, coreIds, calendarByCategory, matchesCrop };
})();

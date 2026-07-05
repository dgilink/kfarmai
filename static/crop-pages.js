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
      officialSources: [],
      officialImages: officialImagePlaceholders(name),
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

  function calendarFor(categoryKey, cropName) {
    const common = {
      grain: [["1월","종자와 재배 계획을 확인합니다."],["3월","파종 또는 육묘 준비를 시작합니다."],["5월","초기 생육과 물관리 상태를 확인합니다."],["7월","고온기 생육과 쓰러짐 가능성을 살핍니다."],["9월","수확 전 품질과 기상 변화를 확인합니다."],["10월","수확과 건조 상태를 점검합니다."]],
      bean: [["4월","파종 전 토양과 배수 상태를 확인합니다."],["5월","파종과 초기 활착을 확인합니다."],["7월","개화기 수분 상태를 살핍니다."],["8월","꼬투리 형성과 고온 스트레스를 확인합니다."],["10월","수확과 건조 상태를 확인합니다."]],
      fruit_vegetable: [["1월","시설 작형은 보온과 환기를 확인합니다."],["2월","육묘와 파종 준비를 점검합니다."],["4월","정식 전후 활착과 저온 피해를 확인합니다."],["6월","개화·착과와 관수 간격을 살핍니다."],["7월","고온·장마기 통풍과 배수를 확인합니다."],["9월","수확과 후기 생육 상태를 기록합니다."]],
      leaf_vegetable: [["2월","봄 작형 파종과 육묘를 준비합니다."],["4월","정식 후 활착과 잎 생육을 확인합니다."],["6월","고온기 추대와 잎끝 마름을 확인합니다."],["8월","가을 작형 파종 전 토양을 준비합니다."],["10월","수확기 품질과 저온 변화를 확인합니다."]],
      root_vegetable: [["3월","봄 파종과 배수 상태를 확인합니다."],["4월","초기 생육과 토양 수분을 확인합니다."],["6월","뿌리 비대와 갈라짐 여부를 확인합니다."],["8월","가을 작형 파종을 준비합니다."],["10월","수확 전 품질과 저장성을 확인합니다."]],
      bulb_vegetable: [["9월","파종 또는 육묘를 준비합니다."],["10월","정식과 월동 전 활착을 확인합니다."],["3월","봄 생육 재개와 잎마름을 확인합니다."],["5월","구 비대와 물관리 상태를 확인합니다."],["6월","수확과 건조 상태를 점검합니다."]],
      fruit_tree: [["1월","휴면기 전정과 동해 흔적을 확인합니다."],["3월","개화 전 수세와 저온 가능성을 확인합니다."],["4월","개화와 착과 상태를 기록합니다."],["6월","과실 비대와 강풍·장마 영향을 확인합니다."],["8월","착색과 수확 전 품질 변화를 확인합니다."],["10월","수확 후 나무 상태와 토양 관리를 점검합니다."]]
    };
    return (common[categoryKey] || common.fruit_vegetable).map(([month, task]) => ({ month, task: `${cropName}: ${task}` }));
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
      ...(crop.relatedInputs || [])
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

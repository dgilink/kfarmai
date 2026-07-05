window.KFARM_CROP_PAGE_DATA = (() => {
  const coreIds = [
    "rice", "pepper", "strawberry", "tomato", "cucumber", "watermelon",
    "korean-melon", "cabbage", "radish", "lettuce", "garlic", "onion",
    "green-onion", "potato", "sweet-potato", "soybean", "corn", "apple",
    "pear", "peach", "grape", "citrus", "blueberry"
  ];

  const core = [
    crop("rice", "벼", "곡류", "🌾", ["쌀", "논벼"], "육묘, 물관리, 출수 전후 확인 포인트를 나누어 보는 기본 식량작물입니다."),
    crop("pepper", "고추", "과채류", "🌶️", ["풋고추", "청양고추", "홍고추"], "고온기 물관리, 배수, 잎 말림과 열매 상태를 함께 확인하는 과채류입니다."),
    crop("strawberry", "딸기", "과채류", "🍓", ["시설딸기", "딸기 육묘"], "육묘와 본포 재배 흐름을 나누어 온습도와 과실 상태를 확인하는 작물입니다."),
    crop("tomato", "토마토", "과채류", "🍅", ["방울토마토", "대추방울토마토"], "시설과 텃밭 조건에 따라 착과, 환기, 수분 변화를 함께 확인하는 작물입니다."),
    crop("cucumber", "오이", "과채류", "🥒", ["취청오이", "백다다기"], "수분 변화와 환기 상태가 생육과 과실 상태에 영향을 주는 작물입니다."),
    crop("watermelon", "수박", "과채류", "🍉", ["애플수박"], "착과 후 수분 관리와 과실 비대 흐름을 함께 확인하는 작물입니다."),
    crop("korean-melon", "참외", "과채류", "🍈", ["성주참외"], "시설 재배 중심으로 환기, 착과, 잎 상태를 함께 보는 작물입니다."),
    crop("cabbage", "배추", "엽채류", "🥬", ["김장배추", "봄배추"], "정식 후 결구기까지 물관리와 잎 상태를 확인하는 엽채류입니다."),
    crop("radish", "무", "근채류", "⚪", ["가을무", "열무", "총각무"], "파종 후 초기 생육과 뿌리 비대 상태를 확인하는 근채류입니다."),
    crop("lettuce", "상추", "엽채류", "🥬", ["청상추", "적상추"], "고온기 추대와 잎끝 마름을 함께 확인하는 엽채류입니다."),
    crop("garlic", "마늘", "인경채류", "🧄", ["한지형마늘", "난지형마늘"], "월동 후 잎 마름과 구 비대, 수확 전 건조 상태를 확인하는 작물입니다."),
    crop("onion", "양파", "인경채류", "🧅", ["조생양파", "중만생양파"], "월동과 비대기 물관리, 잎 쓰러짐 시기를 함께 확인하는 작물입니다."),
    crop("green-onion", "대파", "엽채류", "🌿", ["파", "쪽파"], "북주기, 잎 마름, 배수 상태를 함께 확인하는 작물입니다."),
    crop("potato", "감자", "근채류", "🥔", ["봄감자", "가을감자"], "싹 틔우기, 북주기, 덩이줄기 비대 흐름을 확인하는 작물입니다."),
    crop("sweet-potato", "고구마", "근채류", "🍠", ["밤고구마", "호박고구마"], "순 심기 후 활착과 덩이뿌리 비대 흐름을 확인하는 작물입니다."),
    crop("soybean", "콩", "두류", "🫘", ["대두", "서리태", "백태"], "개화기 물관리와 꼬투리 형성 흐름을 확인하는 두류입니다."),
    crop("corn", "옥수수", "곡류", "🌽", ["찰옥수수", "단옥수수"], "출수 전후 물마름과 쓰러짐을 확인하는 곡류입니다."),
    crop("apple", "사과", "과수", "🍎", ["부사", "홍로"], "개화, 착과, 과실 비대와 수확 전 상태를 확인하는 과수입니다."),
    crop("pear", "배", "과수", "🍐", ["신고배", "황금배"], "개화와 착과, 봉지 씌우기 전후 확인이 필요한 과수입니다."),
    crop("peach", "복숭아", "과수", "🍑", ["황도", "백도"], "개화기 저온, 착과, 수확 전 과실 상태를 확인하는 과수입니다."),
    crop("grape", "포도", "과수", "🍇", ["샤인머스캣", "캠벨"], "송이 관리, 착색, 수확 전 당도와 과실 상태를 확인하는 과수입니다."),
    crop("citrus", "감귤", "과수", "🍊", ["귤", "만감류"], "착과, 비대, 착색기 기상과 과실 상태를 함께 확인하는 과수입니다."),
    crop("blueberry", "블루베리", "과수", "🫐", ["블루베리"], "토양 산도, 물관리, 착과와 수확 전 상태를 확인하는 과수입니다.")
  ].map((item, index) => ({ ...item, type: "core", displayOrder: index + 1, guideLevel: "detailed", calendarLevel: "detailed" }));

  const basic = [
    ["eggplant", "가지", "과채류", "🍆"], ["pumpkin", "호박", "과채류", "🎃"], ["zucchini", "애호박", "과채류", "🥒"],
    ["sweet-pumpkin", "단호박", "과채류", "🎃"], ["cabbage-round", "양배추", "엽채류", "🥬"], ["broccoli", "브로콜리", "엽채류", "🥦"],
    ["cauliflower", "콜리플라워", "엽채류", "🥦"], ["spinach", "시금치", "엽채류", "🥬"], ["crown-daisy", "쑥갓", "엽채류", "🌿"],
    ["perilla-leaf", "깻잎", "엽채류", "🍃"], ["chives", "부추", "엽채류", "🌿"], ["water-celery", "미나리", "엽채류", "🌿"],
    ["young-radish", "열무", "엽채류", "🥬"], ["eolgari", "얼갈이배추", "엽채류", "🥬"], ["carrot", "당근", "근채류", "🥕"],
    ["burdock", "우엉", "근채류", "🥕"], ["taro", "토란", "근채류", "🌿"], ["ginger", "생강", "인경채류", "🫚"],
    ["perilla", "들깨", "특용작물", "🌿"], ["sesame", "참깨", "특용작물", "🌿"], ["red-bean", "팥", "두류", "🫘"],
    ["mung-bean", "녹두", "두류", "🫘"], ["barley", "보리", "곡류", "🌾"], ["wheat", "밀", "곡류", "🌾"],
    ["persimmon", "감", "과수", "🟠"], ["plum", "자두", "과수", "🟣"], ["maesil", "매실", "과수", "🟢"],
    ["apricot", "살구", "과수", "🟠"], ["cherry", "체리", "과수", "🍒"], ["kiwi", "키위", "과수", "🥝"],
    ["fig", "무화과", "과수", "🟣"], ["cham-darae", "참다래", "과수", "🥝"], ["chestnut", "밤", "과수", "🌰"],
    ["jujube", "대추", "과수", "🔴"], ["ginseng", "인삼", "특용작물", "🌿"], ["deodeok", "더덕", "특용작물", "🌿"],
    ["balloon-flower-root", "도라지", "특용작물", "🌿"], ["medicinal-crops", "약용작물", "특용작물", "🌿"],
    ["chrysanthemum", "국화", "화훼", "🌼"], ["rose", "장미", "화훼", "🌹"], ["carnation", "카네이션", "화훼", "🌸"],
    ["cymbidium", "심비디움", "화훼", "🌼"], ["succulent", "다육식물", "홈가드닝", "🌵"], ["monstera", "몬스테라", "홈가드닝", "🌿"],
    ["stuckyi", "스투키", "홈가드닝", "🌵"], ["sansevieria", "산세베리아", "홈가드닝", "🌵"], ["rubber-tree", "고무나무", "홈가드닝", "🌳"],
    ["basil", "바질", "허브", "🌿"], ["rosemary", "로즈마리", "허브", "🌿"], ["mint", "민트", "허브", "🌿"]
  ].map(([id, name, category, icon]) => ({
    id, name, category, icon, type: "basic", aliases: [name],
    guideLevel: "basic", calendarLevel: "basic",
    summary: `${name}은 지역, 품종, 시설 여부에 따라 재배 시기와 관리 방법이 달라질 수 있는 ${category} 작물입니다.`,
    basicNote: "현재 이 작물은 기본 정보만 제공 중입니다. 공공기관 재배자료와 지역별 재배달력은 순차적으로 보강 예정입니다.",
    officialImageUrl: "", officialImageSource: "", officialImageLicenseNote: "", officialImageStatus: "pending"
  }));

  const calendarByCategory = {
    "곡류": months(["파종 또는 육묘 준비", "정식 또는 생육 초기 확인", "물관리와 생육 상태 확인", "출수 전후 확인", "수확 전 상태 확인"]),
    "두류": months(["파종 준비", "초기 생육 확인", "개화기 물관리", "꼬투리 형성 확인", "수확 전 건조 상태 확인"]),
    "과채류": months(["육묘와 정식 준비", "정식 후 활착 확인", "착화와 착과 상태 확인", "고온기 물관리와 환기 확인", "수확 전 과실 상태 확인"]),
    "엽채류": months(["파종 또는 정식 준비", "초기 활착 확인", "잎 생육과 수분 상태 확인", "고온기 추대와 잎끝 상태 확인", "수확 전 잎 상태 확인"]),
    "근채류": months(["파종 또는 순 심기 준비", "초기 활착 확인", "북주기와 배수 확인", "뿌리 또는 덩이 비대 확인", "수확 전 표면과 건조 상태 확인"]),
    "인경채류": months(["파종 또는 정식 준비", "월동 전후 생육 확인", "잎 마름과 물관리 확인", "구 비대 상태 확인", "수확 전 건조 상태 확인"]),
    "과수": months(["전정과 개화 전 준비", "개화와 착과 확인", "과실 비대와 물관리 확인", "착색과 수확 전 상태 확인", "수확 후 나무 상태 확인"])
  };

  function crop(id, name, category, icon, aliases, summary) {
    return {
      id, name, category, icon, aliases, summary,
      stages: ["준비기", "초기 생육", "생육 관리", "수확 전 확인"],
      managementPoints: categoryPoints(category),
      commonProblems: commonProblems(category),
      weatherPoints: ["기온", "강수확률", "강수량", "습도", "풍속"].map(v => `${v} 변화를 농업날씨와 함께 확인합니다.`),
      materials: materialTypes(category),
      officialImageUrl: "", officialImageSource: "", officialImageLicenseNote: "", officialImageStatus: "pending"
    };
  }

  function categoryPoints(category) {
    const map = {
      "곡류": ["파종 또는 육묘 시기 확인", "물관리와 배수 상태 확인", "수확 전 쓰러짐과 건조 상태 확인"],
      "두류": ["파종 간격과 초기 활착 확인", "개화기 수분 상태 확인", "꼬투리 형성기 생육 상태 확인"],
      "과채류": ["정식 후 활착과 뿌리 상태 확인", "환기와 수분 변화 확인", "착과와 과실 표면 상태 확인"],
      "엽채류": ["정식 후 잎 처짐 확인", "고온기 추대와 잎끝 마름 확인", "수확 전 잎 상태 확인"],
      "근채류": ["초기 생육과 배수 확인", "북주기 또는 흙 덮기 시기 확인", "뿌리 비대와 갈라짐 여부 확인"],
      "인경채류": ["월동 전후 잎 상태 확인", "비대기 물관리 확인", "수확 전 건조 상태 확인"],
      "과수": ["개화 전 나무 상태 확인", "착과와 과실 비대 확인", "수확 전 착색과 표면 상태 확인"]
    };
    return map[category] || ["생육 단계 확인", "물관리 확인", "공식자료 확인"];
  }

  function commonProblems(category) {
    const map = {
      "과채류": ["잎 말림", "과실 반점", "착과 불량"],
      "엽채류": ["잎끝 마름", "잎 반점", "시듦"],
      "근채류": ["뿌리 갈라짐", "잎 마름", "생육 지연"],
      "인경채류": ["잎 마름", "구 비대 불량", "물러짐"],
      "과수": ["잎 반점", "과실 표면 이상", "착과 불량"]
    };
    return map[category] || ["잎 색 변화", "생육 지연", "수분 스트레스"];
  }

  function materialTypes(category) {
    if (category === "과수") return ["전정 도구", "지주·유인 자재", "토양개량 참고자료"];
    if (category === "엽채류") return ["상토", "관수 자재", "비료·액비 참고자료"];
    if (category === "근채류" || category === "인경채류") return ["상토", "배수 관리 자재", "비료 참고자료"];
    return ["상토", "관수 자재", "비료·액비 참고자료"];
  }

  function months(tasks) {
    return [
      { range: "1-2월", task: tasks[0] },
      { range: "3-4월", task: tasks[1] },
      { range: "5-6월", task: tasks[2] },
      { range: "7-9월", task: tasks[3] },
      { range: "10-12월", task: tasks[4] }
    ];
  }

  return { core, basic, all: [...core, ...basic], coreIds, calendarByCategory };
})();

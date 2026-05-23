const cpaData = [
  {
    "grade": "정회원",
    "company": "(주)경농",
    "ceo": "이병만·이용진",
    "addr": "서울시 서초구 효령로77길 28 (동오빌딩)",
    "tel": "02-3488-5800",
    "homepage": "http://www.knco.co.kr/"
  },
  {
    "grade": "정회원",
    "company": "(주)농협케미컬",
    "ceo": "하명곤",
    "addr": "경기도 성남시 분당구 분당로 53번길 3",
    "tel": "031-738-5200",
    "homepage": "http://www.nhchemical.com/"
  },
  {
    "grade": "정회원",
    "company": "(주)동방아그로",
    "ceo": "염병만·염병진",
    "addr": "서울시 관악구 남부순환로 2028",
    "tel": "02-580-3600",
    "homepage": "http://www.dongbangagro.co.kr/"
  },
  {
    "grade": "정회원",
    "company": "바이엘크롭사이언스(주)",
    "ceo": "이지숙",
    "addr": "서울시 영등포구 여의대로108 파크원타워2 24층",
    "tel": "02-3450-1300",
    "homepage": "https://www.cropscience.bayer.co.kr/"
  },
  {
    "grade": "정회원",
    "company": "에스비성보주식회사",
    "ceo": "윤정선",
    "addr": "서울시 강남구 테헤란로104길 26(대치동, SBwith타워)",
    "tel": "02-3789-3800",
    "homepage": "http://www.sbcc.kr/"
  },
  {
    "grade": "정회원",
    "company": "신젠타코리아(주)",
    "ceo": "조승영",
    "addr": "서울시 종로구 종로 47 (스탠다드차타드은행 본점빌딩 18층)",
    "tel": "02-398-5500",
    "homepage": "https://www.syngenta.co.kr/"
  },
  {
    "grade": "정회원",
    "company": "(주)팜한농",
    "ceo": "김무용",
    "addr": "서울시 영등포구 여의대로 24 (전경련회관 5~6층)",
    "tel": "02-3159-5500",
    "homepage": "https://www.farmhannong.com/"
  },
  {
    "grade": "정회원",
    "company": "한국삼공(주)",
    "ceo": "한태원·한동우",
    "addr": "서울시 서초구 강남대로 285 (태우빌딩)",
    "tel": "02-2287-2900",
    "homepage": "http://www.30agro.co.kr/"
  },
  {
    "grade": "정회원",
    "company": "선문그린사이언스(주)",
    "ceo": "김인수",
    "addr": "서울시 성동구 성수일로55, SK테크로빌딩 801호",
    "tel": "02-3452-2324",
    "homepage": "http://www.smgs.kr/"
  },
  {
    "grade": "정회원",
    "company": "인바이오(주)",
    "ceo": "이명재",
    "addr": "경기도 군포시 번영로28번길 37-20 (3, 4층)",
    "tel": "031-477-6011",
    "homepage": "http://www.enbio.co.kr/"
  },
  {
    "grade": "정회원",
    "company": "(주)한얼싸이언스",
    "ceo": "심봉섭",
    "addr": "(성남사무소)경기도 성남시 중원구 사기막골로 124  (SKⓝ테크노파크 비즈센타동 809호)",
    "tel": "031-627-9999",
    "homepage": "http://www.hescience.co.kr/"
  },
  {
    "grade": "준회원",
    "company": "니치노코리아(주)",
    "ceo": "함형승",
    "addr": "서울시 강남구 삼성로 508, 607 & 609호 (엘지트윈텔2)",
    "tel": "02-2191-5283",
    "homepage": ""
  },
  {
    "grade": "준회원",
    "company": "디스커버리이에스코리아(주)",
    "ceo": "유스케 호리",
    "addr": "서울시 영등포구 의사당대로 83, 16층",
    "tel": "070-7488-5151",
    "homepage": "https://www.kr.envu.com/"
  },
  {
    "grade": "준회원",
    "company": "(주)누보",
    "ceo": "김창균",
    "addr": "경기도 수원시 권선구 서호로 89 (창업지원센터 6동 325호)",
    "tel": "031-1544-3098",
    "homepage": "http://www.nousbo.com/"
  },
  {
    "grade": "준회원",
    "company": "닛산케미칼아그로코리아(주)",
    "ceo": "진종석",
    "addr": "서울시 강남구 언주로 430 (윤익빌딩 701호)",
    "tel": "02-774-6470",
    "homepage": ""
  },
  {
    "grade": "준회원",
    "company": "닛소코리아(주)",
    "ceo": "권오진",
    "addr": "서울시 강남구 테헤란로 406 (샹제리제센터빌딩A동 1401호)",
    "tel": "02-2051-7717~9",
    "homepage": ""
  },
  {
    "grade": "준회원",
    "company": "(주)대유",
    "ceo": "남을진",
    "addr": "서울시 강남구 학동로77길 26 (대유빌딩)",
    "tel": "02-556-6293",
    "homepage": "https://www.dae-yu.co.kr/"
  },
  {
    "grade": "준회원",
    "company": "에버그린에이지",
    "ceo": "김기영",
    "addr": "경기도 용인시 기흥구 기흥로 58-1, A동 1504호 (구갈동, 기흥ICT밸리)",
    "tel": "031-285-0811",
    "homepage": ""
  },
  {
    "grade": "준회원",
    "company": "미쓰이화학크롭앤라이프솔루션코리아㈜",
    "ceo": "황정철",
    "addr": "서울시 강남구 테헤란로 10길 6, 6층 (역삼동, 녹명빌딩)",
    "tel": "02-2038-4841",
    "homepage": ""
  },
  {
    "grade": "준회원",
    "company": "스미토모화학아그로서울(주)",
    "ceo": "마츠모토 켄스케",
    "addr": "서울시 강남구 테헤란로 422 (KT선릉타워 2층)",
    "tel": "02-558-4812",
    "homepage": ""
  },
  {
    "grade": "준회원",
    "company": "아그로카네쇼코리아(주)",
    "ceo": "이계형",
    "addr": "서울시 강남구 테헤란로 322 (한신인터밸리서관 1204호)",
    "tel": "02-2183-1711",
    "homepage": "https://www.agrokanesho.co.jp/"
  },
  {
    "grade": "준회원",
    "company": "아그리젠토(주)",
    "ceo": "진남수",
    "addr": "경기도 성남시 분당구 대왕판교로 660 (유스페이스빌딩 1-A동 1012호)",
    "tel": "031-628-1898",
    "homepage": "http://www.agrigento.or.kr/"
  },
  {
    "grade": "준회원",
    "company": "아다마코리아(주)",
    "ceo": "고재경",
    "addr": "서울시 서초구 마방로10길 5 (태석빌딩 8층)",
    "tel": "02-571-5001",
    "homepage": "https://www.adama.com/korea/ko/"
  },
  {
    "grade": "준회원",
    "company": "ISK바이오사이언스 코리아(주)",
    "ceo": "정모세",
    "addr": "서울시 강남구 강남대로66길 8 (카이로스빌딩 7층)",
    "tel": "02-555-1401",
    "homepage": "http://www.iskbio.co.kr/"
  },
  {
    "grade": "준회원",
    "company": "(주)SDS 바이오테크 서울지점",
    "ceo": "이영호",
    "addr": "경기도 안양시 동안구 평촌대로 239 (신안메트로칸빌딩 617호)",
    "tel": "031-382-5083",
    "homepage": ""
  },
  {
    "grade": "준회원",
    "company": "에프엠씨코리아(주)",
    "ceo": "우차오후이",
    "addr": "서울시 강남구 도곡로 111 (미진빌딩 7층)",
    "tel": "02-539-6411",
    "homepage": "http://www.fmc.com/"
  },
  {
    "grade": "준회원",
    "company": "유원에코사이언스(주)",
    "ceo": "김헌성",
    "addr": "경기도 용인시 기흥구 동백중앙로16번길 16-4(에이스동백타워 1동 709호)",
    "tel": "031-291-6106~8",
    "homepage": "http://www.yweco.com/"
  },
  {
    "grade": "준회원",
    "company": "(주)유일",
    "ceo": "한영홍",
    "addr": "(서울사무소)서울시 종로구 난계로 255 (대경빌딩 2층)",
    "tel": "02-2237-1565",
    "homepage": "http://www.yooill.co.kr"
  },
  {
    "grade": "준회원",
    "company": "(주)유피엘리미티드코리아",
    "ceo": "오베로이마니시",
    "addr": "서울시 송파구 법원로 127,(문정대명밸리온 13층 1311호)",
    "tel": "02-538-4112",
    "homepage": "https://www.upl-ltd.com/"
  },
  {
    "grade": "준회원",
    "company": "㈜이엑스아이디",
    "ceo": "이영표",
    "addr": "",
    "tel": "010-3393-2796",
    "homepage": ""
  },
  {
    "grade": "준회원",
    "company": "(주)장유산업",
    "ceo": "서윤섭",
    "addr": "",
    "tel": "043-217-8808~9",
    "homepage": "http://www.agrox.co.kr/"
  },
  {
    "grade": "준회원",
    "company": "(주)케이씨생명과학",
    "ceo": "신규식",
    "addr": "서울시 송파구 법원로11길 7 (문정현대지식산업센터 C동 1215호)",
    "tel": "02-3453-6525",
    "homepage": "http://www.kcbio.co.kr/"
  },
  {
    "grade": "준회원",
    "company": "코르테바아그리사이언스코리아(유)",
    "ceo": "이필호",
    "addr": "서울시 중구 칠패로 37 (HSBC빌딩 15층)",
    "tel": "02-2223-8900",
    "homepage": "https://www.corteva.co.kr/"
  },
  {
    "grade": "준회원",
    "company": "(주)천지인바이오텍",
    "ceo": "권병오",
    "addr": "강원도 태백시 철암공단길 16-25(철암동)",
    "tel": "033-554-4416",
    "homepage": "http://www.chunjiinbt.com/"
  },
  {
    "grade": "준회원",
    "company": "(주)태준아그로텍",
    "ceo": "박승기",
    "addr": "경기도 성남시 중원구 둔촌대로457번길 27, 606호",
    "tel": "031-737-2922",
    "homepage": "http://www.taejun.co.kr/"
  },
  {
    "grade": "준회원",
    "company": "태평에이지(주)",
    "ceo": "김종관",
    "addr": "",
    "tel": "054-336-8401",
    "homepage": ""
  },
  {
    "grade": "준회원",
    "company": "팜아그로텍(주)",
    "ceo": "이재혁",
    "addr": "",
    "tel": "043-750-8794",
    "homepage": ""
  },
  {
    "grade": "준회원",
    "company": "(주)하나바이오",
    "ceo": "심봉섭",
    "addr": "강원도 태백시 철암공단길 16-30",
    "tel": "031-627-9906",
    "homepage": ""
  },
  {
    "grade": "준회원",
    "company": "한국바스프(주)",
    "ceo": "이우석",
    "addr": "서울시 중구 세종대로 39 (대한상공회의소빌딩 15층)",
    "tel": "02-3707-7866",
    "homepage": "https://www.basf.com/"
  }
];
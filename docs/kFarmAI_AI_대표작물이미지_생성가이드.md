# kFarmAI AI 대표작물 이미지 생성 가이드

이 문서는 재배가이드와 재배달력에 사용하는 AI 생성 대표 이미지를 관리하기 위한 기준이다. AI 생성 이미지는 공식사진, 공공기관 자료, 병해충 진단 근거 사진이 아니며, 화면에서는 반드시 "AI로 생성한 참고 이미지"로 표시한다.

## 공통 원칙

- 실제 농업 참고용 느낌의 깨끗하고 자연스러운 재배 장면으로 만든다.
- 병해충 증상, 피해 장면, 진단 근거처럼 보이는 표현은 넣지 않는다.
- 농촌진흥청, 농사로, 지자체 등 공식기관 사진처럼 오인될 로고, 문서, 워터마크를 넣지 않는다.
- 이미지 안에는 텍스트, 로고, 워터마크를 넣지 않는다.
- 모바일 카드에 어울리는 4:3 또는 16:9 비율을 우선한다.
- 실제 품종, 생육상태, 재배환경은 다를 수 있다는 안내를 함께 표시한다.
- 대표 이미지 파일명은 `static/crops/{crop-id}-ai.png` 형식을 사용한다.

## 화면 고지 문구

대표 이미지 아래에는 다음 문구를 사용한다.

```text
AI로 생성한 참고 이미지입니다.
실제 품종, 생육상태, 재배환경은 다를 수 있습니다.
```

생육단계 이미지에는 다음 문구를 사용한다.

```text
AI로 생성한 생육단계 참고 이미지입니다.
작물별 실제 생육은 품종, 지역, 작형에 따라 달라질 수 있습니다.
```

## 생성 프롬프트 기준

공통 조건:

```text
realistic agricultural reference image, healthy crop, clean natural farm scene, no disease symptoms, no pests, no text, no logo, no watermark, mobile-friendly 4:3 composition
```

작물별로는 다음처럼 작물명과 재배 장면을 바꿔 사용한다.

- 벼: healthy green rice plants in a Korean paddy field
- 고추: healthy pepper plants with red and green peppers
- 딸기: healthy strawberry plants in a greenhouse bed
- 토마토: healthy tomato plants in a greenhouse row
- 오이: healthy cucumber vines in a greenhouse row
- 수박: healthy watermelon field with visible watermelons
- 참외: healthy Korean melon greenhouse or field
- 배추: healthy cabbage field
- 무: healthy radish field with radish roots visible
- 상추: healthy lettuce rows in a small farm
- 마늘: healthy garlic field
- 양파: healthy onion field
- 대파: healthy green onion field
- 감자: healthy potato plants in soil ridges
- 고구마: healthy sweet potato plants with roots visible
- 콩: healthy soybean field
- 옥수수: healthy corn field
- 사과: healthy apple orchard
- 배: healthy Korean pear orchard
- 복숭아: healthy peach orchard
- 포도: healthy grape vineyard
- 감귤: healthy citrus orchard
- 블루베리: healthy blueberry shrubs

## 2026-07-06 대표 이미지 연결 현황

`static/crops` 폴더에 실제 존재하는 AI 생성 대표 이미지만 `static/crop-pages.js`의 `representativeImage`로 연결했다. 깨진 이미지 경로를 막기 위해 파일이 없는 작물에는 URL을 넣지 않는다.

### 현재 연결된 대표 이미지

- 벼: `static/crops/rice-ai.png`
- 고추: `static/crops/pepper-ai.png`
- 딸기: `static/crops/strawberry-ai.png`
- 토마토: `static/crops/tomato-ai.png`
- 오이: `static/crops/cucumber-ai.png`
- 수박: `static/crops/watermelon-ai.png`
- 참외: `static/crops/melon-ai.png`
- 배추: `static/crops/cabbage-ai.png`
- 무: `static/crops/radish-ai.png`
- 상추: `static/crops/lettuce-ai.png`
- 마늘: `static/crops/garlic-ai.png`
- 양파: `static/crops/onion-ai.png`
- 대파: `static/crops/greenonion-ai.png`
- 감자: `static/crops/potato-ai.png`
- 고구마: `static/crops/sweetpotato-ai.png`
- 콩: `static/crops/soybean-ai.png`
- 옥수수: `static/crops/corn-ai.png`
- 사과: `static/crops/apple-ai.png`
- 배: `static/crops/pear-ai.png`
- 복숭아: `static/crops/peach-ai.png`
- 포도: `static/crops/grape-ai.png`
- 감귤: `static/crops/tangerine-ai.png`
- 블루베리: `static/crops/blueberry-ai.png`

### 아직 대표 이미지가 없는 작물

23개 대표 작물 기준으로는 현재 대표 이미지가 없는 작물이 없다. 23개 외 basic 작물은 기존 이모지/아이콘 fallback을 유지한다.

## 생육단계 이미지 파일 규칙

- 묶음 이미지: `static/crops/stages/crop-growth-stages-core-01-ai.png`
- 묶음 이미지: `static/crops/stages/crop-growth-stages-core-02-ai.png`
- 묶음 이미지: `static/crops/stages/crop-growth-stages-core-03-ai.png`
- 개별 작물 카드: `static/crops/stages/individual/{crop-id}-stages-ai.png`

감귤은 `tangerine-stages-ai.png`, 참외는 `melon-stages-ai.png`, 대파는 `greenonion-stages-ai.png`, 고구마는 `sweetpotato-stages-ai.png` 파일명을 사용한다.

## 발표 후 보완 TODO

- AI 대표 이미지의 WebP 변환과 썸네일 최적화 검토
- 공식자료와 공식사진은 출처, 공공누리 유형, 사용조건 확인 후 별도 반영
- 외부 이미지 hotlink 금지, 허용된 이미지만 저장소 또는 kFarmAI 서버에 저장해서 사용
- 23개 외 basic 작물 대표 이미지 확장 여부 검토

# kFarmAI AI 대표 작물 이미지 생성 가이드

이 문서는 재배가이드와 재배달력에 사용할 “대표 참고 이미지” 생성 기준을 정리한다. AI 생성 이미지는 공식사진, 공공기관 자료, 병해충 진단 근거사진이 아니다. 화면에는 반드시 “AI로 생성한 참고 이미지입니다.”라고 표시한다.

## 공통 기준

- 실제 농업 참고용 느낌의 깨끗하고 자연스러운 재배 장면으로 만든다.
- 병해충 증상, 피해 장면, 진단 근거처럼 보이는 표현은 넣지 않는다.
- 농촌진흥청, 농사로, 지자체 등 공식기관 사진처럼 오인될 수 있는 로고, 문서, 표지판, 워터마크를 넣지 않는다.
- 이미지 안에 텍스트, 로고, 워터마크를 넣지 않는다.
- 모바일 카드에 어울리도록 4:3 또는 16:9 비율을 사용한다.
- 실제 품종, 생육상태, 재배환경은 다를 수 있다는 안내와 함께 사용한다.
- 저장 파일명은 `static/crops/{crop-id}-ai.png` 또는 `static/crops/{crop-id}-ai.webp` 형식을 사용한다. 실제 화면 데이터의 URL은 저장된 파일 확장자와 반드시 일치시킨다.

## 벼

Prompt:

```text
Clean natural rice paddy field in Korea, healthy green rice plants, soft daylight, realistic agricultural reference image, no disease symptoms, no pests, no text, no logo, no watermark, 4:3 aspect ratio, mobile-friendly composition
```

현재 적용 파일명: `static/crops/rice-ai.png`

## 고추

Prompt:

```text
Healthy pepper plants growing in a small farm row, green leaves and red and green peppers visible, natural daylight, realistic agricultural reference image, clean background, no disease symptoms, no pests, no text, no logo, no watermark, 4:3 aspect ratio
```

현재 적용 파일명: `static/crops/pepper-ai.png`

## 딸기

Prompt:

```text
Healthy strawberry plants in a greenhouse bed, ripe red strawberries and clean green leaves, soft natural light, realistic agricultural reference image, no disease symptoms, no pests, no text, no logo, no watermark, 4:3 aspect ratio
```

현재 적용 파일명: `static/crops/strawberry-ai.png`

## 사과

Prompt:

```text
Healthy apple tree branch in an orchard, red apples and green leaves, natural daylight, realistic agricultural reference image, clean orchard background, no disease symptoms, no pests, no text, no logo, no watermark, 4:3 aspect ratio
```

현재 적용 파일명: `static/crops/apple-ai.png`

## 배

Prompt:

```text
Healthy Korean pear tree branch in an orchard, round yellow-green pears and clean leaves, natural daylight, realistic agricultural reference image, no disease symptoms, no pests, no text, no logo, no watermark, 4:3 aspect ratio
```

현재 적용 파일명: `static/crops/pear-ai.png`

## 복숭아

Prompt:

```text
Healthy peach tree branch in an orchard, ripe peaches with green leaves, warm natural daylight, realistic agricultural reference image, no disease symptoms, no pests, no text, no logo, no watermark, 4:3 aspect ratio
```

현재 적용 파일명: `static/crops/peach-ai.png`

## 화면 고지 문구

재배가이드와 재배달력 상세 이미지 아래에는 다음 문구를 표시한다.

```text
AI로 생성한 참고 이미지입니다. 실제 품종, 생육상태, 재배환경은 다를 수 있습니다.
```

## 적용 전 체크

- 이미지 파일이 실제로 저장소 또는 허용된 정적 경로에 있는지 확인한다.
- `representativeImage.url`은 실제 파일이 있을 때만 입력한다.
- 없는 파일 경로를 미리 넣지 않는다.
- 공식자료 이미지와 AI 생성 이미지를 같은 영역에서 혼동되게 표시하지 않는다.

## 2026-07-05 시제품 적용 파일

발표 전 시제품 완성도를 위해 현재 저장소에 들어온 AI 생성 이미지를 "AI 참고 이미지"로만 연결한다. 공식사진, 공공기관 사진, 병해충 진단용 근거사진으로 표시하지 않는다.

### 대표 이미지

- `static/crops/rice-ai.png`
- `static/crops/pepper-ai.png`
- `static/crops/strawberry-ai.png`
- `static/crops/apple-ai.png`
- `static/crops/pear-ai.png`
- `static/crops/peach-ai.png`

### 23개 대표 작물 콜라주

- `static/crops/crop-representative-grid-23-ai.png`

### 생육단계 묶음 이미지

- `static/crops/stages/crop-growth-stages-core-01-ai.png`: 벼, 고추, 딸기, 사과, 배, 복숭아, 포도, 감귤
- `static/crops/stages/crop-growth-stages-core-02-ai.png`: 토마토, 수박, 참외, 오이, 가지, 배추, 무, 대파
- `static/crops/stages/crop-growth-stages-core-03-ai.png`: 마늘, 양파, 콩, 옥수수, 감자, 고구마, 들깨

### 작물별 생육단계 카드

`static/crops/stages/individual/{crop-id}-stages-ai.png` 규칙을 사용한다. 감귤은 `tangerine-stages-ai.png`, 참외는 `melon-stages-ai.png`, 대파는 `greenonion-stages-ai.png`, 고구마는 `sweetpotato-stages-ai.png`로 저장했다.

### 화면 고지 문구

```text
AI로 생성한 참고 이미지입니다.
실제 품종, 생육상태, 재배환경은 다를 수 있습니다.
```

생육단계 이미지에는 아래 문구를 사용한다.

```text
AI로 생성한 생육단계 참고 이미지입니다.
작물별 실제 생육은 품종, 지역, 작형에 따라 달라질 수 있습니다.
```

### 발표 후 보완 TODO

- 상추, 블루베리 개별 대표 이미지와 생육단계 이미지 생성 또는 공식자료 확인
- 23개 대표 작물 전체의 개별 대표 이미지 보강
- 공식자료/공식사진은 출처, 공공누리 유형, 사용조건 확인 후 별도 반영
- PNG 원본 용량이 큰 파일은 WebP 변환 및 썸네일 생성 검토
- 외부 이미지 hotlink 금지, 허용된 이미지만 저장소 또는 kFarmAI 서버에 저장 후 사용

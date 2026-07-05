# kFarmAI AI 대표 작물 이미지 생성 가이드

이 문서는 재배가이드와 재배달력에 사용할 “대표 참고 이미지” 생성 기준을 정리한다. AI 생성 이미지는 공식사진, 공공기관 자료, 병해충 진단 근거사진이 아니다. 화면에는 반드시 “AI로 생성한 참고 이미지입니다.”라고 표시한다.

## 공통 기준

- 실제 농업 참고용 느낌의 깨끗하고 자연스러운 재배 장면으로 만든다.
- 병해충 증상, 피해 장면, 진단 근거처럼 보이는 표현은 넣지 않는다.
- 농촌진흥청, 농사로, 지자체 등 공식기관 사진처럼 오인될 수 있는 로고, 문서, 표지판, 워터마크를 넣지 않는다.
- 이미지 안에 텍스트, 로고, 워터마크를 넣지 않는다.
- 모바일 카드에 어울리도록 4:3 또는 16:9 비율을 사용한다.
- 실제 품종, 생육상태, 재배환경은 다를 수 있다는 안내와 함께 사용한다.
- 저장 파일명은 `static/crops/{crop-id}-ai.webp` 형식을 권장한다.

## 벼

Prompt:

```text
Clean natural rice paddy field in Korea, healthy green rice plants, soft daylight, realistic agricultural reference image, no disease symptoms, no pests, no text, no logo, no watermark, 4:3 aspect ratio, mobile-friendly composition
```

권장 파일명: `static/crops/rice-ai.webp`

## 고추

Prompt:

```text
Healthy pepper plants growing in a small farm row, green leaves and red and green peppers visible, natural daylight, realistic agricultural reference image, clean background, no disease symptoms, no pests, no text, no logo, no watermark, 4:3 aspect ratio
```

권장 파일명: `static/crops/pepper-ai.webp`

## 딸기

Prompt:

```text
Healthy strawberry plants in a greenhouse bed, ripe red strawberries and clean green leaves, soft natural light, realistic agricultural reference image, no disease symptoms, no pests, no text, no logo, no watermark, 4:3 aspect ratio
```

권장 파일명: `static/crops/strawberry-ai.webp`

## 사과

Prompt:

```text
Healthy apple tree branch in an orchard, red apples and green leaves, natural daylight, realistic agricultural reference image, clean orchard background, no disease symptoms, no pests, no text, no logo, no watermark, 4:3 aspect ratio
```

권장 파일명: `static/crops/apple-ai.webp`

## 배

Prompt:

```text
Healthy Korean pear tree branch in an orchard, round yellow-green pears and clean leaves, natural daylight, realistic agricultural reference image, no disease symptoms, no pests, no text, no logo, no watermark, 4:3 aspect ratio
```

권장 파일명: `static/crops/pear-ai.webp`

## 복숭아

Prompt:

```text
Healthy peach tree branch in an orchard, ripe peaches with green leaves, warm natural daylight, realistic agricultural reference image, no disease symptoms, no pests, no text, no logo, no watermark, 4:3 aspect ratio
```

권장 파일명: `static/crops/peach-ai.webp`

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

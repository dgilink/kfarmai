# kFarmAI AI 참고 진단과 공공데이터 보고서 연결 설계

## 1. 목적

이 문서는 AI 참고 진단 완료 화면에서 진단 결과를 구조화해 저장하고, 사용자가 버튼 하나로 `public-data.html`의 공공데이터 매칭 보고서까지 이동하는 연결 구조를 설계한다.

목표:

- AI 참고 진단 결과가 자연어 문장으로 끝나지 않게 한다.
- 작물, 증상, 원인 후보를 `kfarmai:lastDiagnosis`에 저장한다.
- `public-data.html`에서 저장된 진단 결과를 읽어 매칭엔진을 실행한다.
- 사용자는 AI 결과 화면에서 `공공데이터로 확인` 버튼만 누르면 1장 보고서를 볼 수 있다.
- 확정 진단, 농약 추천, 최종 처방처럼 보이지 않게 한다.

핵심 문장:

> AI 참고 진단 결과는 사용자가 읽는 요약과 공공데이터 매칭용 구조화 데이터를 함께 남기고, 공공데이터 보고서는 이 구조화 데이터를 기준으로 생성한다.

## 2. 현재 상태

현재 구현된 상태:

- `static/js/public-data/public-data-sources.js`
  - NCPMS, PSIS, 농업날씨, 농사로, 재배가이드, 관계기관 출처 정의
- `static/js/public-data/matching-engine.js`
  - `KFPublicDataMatchingEngine.matchDiagnosisToPublicData(diagnosis)` 제공
  - 고추+잎말림, 토마토+반점, 딸기+잿빛곰팡이, 벼+도열병 대표 케이스 지원
  - fallback 매칭 지원
- `public-data.html`
  - URL query, 직접 입력, localStorage 일부 값을 읽어 공공데이터 매칭 보고서 표시

아직 필요한 연결:

- AI 참고 진단 완료 화면에서 구조화 데이터를 저장
- AI 참고 진단 완료 화면에 `공공데이터로 확인` 버튼 배치
- 버튼 클릭 시 `public-data.html`로 이동
- 이동 후 `public-data.html`이 `kfarmai:lastDiagnosis`를 기준으로 보고서 표시

## 3. 최종 사용자 흐름

```text
AI 참고 진단 입력
↓
AI 참고 진단 결과 생성
↓
화면에 사용자용 요약 표시
↓
동시에 structuredDiagnosis 생성
↓
localStorage.kfarmai:lastDiagnosis 저장
↓
사용자가 [공공데이터로 확인] 클릭
↓
public-data.html 이동
↓
public-data.html이 kfarmai:lastDiagnosis 읽기
↓
KFPublicDataMatchingEngine 실행
↓
공공데이터 매칭 보고서 표시
```

사용자는 AI 결과 화면에서 복잡한 JSON을 보지 않는다. 화면에는 원인 후보, 확인 포인트, 주의문구, 다음 행동 버튼만 보인다.

## 4. AI 결과 화면에서 저장할 데이터

저장 key:

```text
kfarmai:lastDiagnosis
```

저장 시점:

- AI 참고 진단 결과가 정상 생성된 직후
- 화면에 결과 카드가 렌더링되기 전 또는 직후
- 사용자가 버튼을 누르기 전에 이미 저장되어 있어야 한다.

저장 형식:

```json
{
  "diagnosisId": "local-20260707-001",
  "createdAt": "2026-07-07T10:00:00+09:00",
  "mode": "AI 참고 진단",
  "inputType": "image_text",
  "crop": "고추",
  "cropCandidates": ["고추", "청양고추"],
  "symptom": "잎말림",
  "symptoms": ["잎말림", "생육 저하"],
  "symptomKeywords": ["잎말림", "잎 오그라듦", "신엽 말림"],
  "region": "충청권",
  "cultivationType": "노지",
  "growthStage": "생육기",
  "aiSummary": "잎이 말리는 증상은 해충, 바이러스성 증상, 환경 스트레스가 함께 원인이 될 수 있습니다.",
  "aiCandidates": [
    {
      "name": "해충 피해 가능성",
      "category": "pest",
      "keywords": ["진딧물", "총채벌레", "흡즙해충", "해충"],
      "reason": "잎이 말리거나 신엽이 위축되는 증상은 흡즙성 해충 피해와 함께 확인할 수 있습니다."
    },
    {
      "name": "바이러스성 증상 가능성",
      "category": "disease",
      "keywords": ["바이러스", "모자이크", "위조"],
      "reason": "잎 말림과 생육 이상은 바이러스성 증상과 함께 확인할 수 있습니다."
    },
    {
      "name": "고온·건조 스트레스 가능성",
      "category": "environment",
      "keywords": ["고온", "건조", "수분부족"],
      "reason": "고온과 건조한 환경에서는 잎 말림이나 생육 저하가 나타날 수 있습니다."
    }
  ],
  "matchingTargets": ["ncpms", "psis", "agriWeather", "cropGuide"],
  "confidenceLevel": "reference",
  "cautionText": "사진과 입력 정보만으로는 확정 진단할 수 없습니다.",
  "imageUrl": null
}
```

필수 필드:

- `diagnosisId`
- `createdAt`
- `mode`
- `crop`
- `symptom`
- `aiSummary`
- `aiCandidates`
- `confidenceLevel`
- `cautionText`

권장 필드:

- `cropCandidates`
- `symptoms`
- `symptomKeywords`
- `region`
- `cultivationType`
- `growthStage`
- `matchingTargets`
- `imageUrl`

## 5. AI 결과 화면의 버튼 구성

AI 참고 진단 완료 화면에는 다음 버튼을 제공한다.

1. `공공데이터로 확인`
   - 가장 중요한 연결 버튼
   - `kfarmai:lastDiagnosis` 저장 후 `public-data.html`로 이동
   - 버튼 문구는 `공공데이터로 확인` 또는 `공공데이터 매칭 보고서 보기`

2. `이 결과 저장하기`
   - AI 참고 진단 결과만 저장
   - 마이페이지 저장은 후속 단계
   - 초기에는 localStorage history 저장 가능

3. `다시 진단하기`
   - 입력 화면으로 돌아감
   - 기존 입력값 초기화 여부는 별도 결정

권장 버튼 우선순위:

```text
[공공데이터로 확인]
[이 결과 저장하기] [다시 진단하기]
```

표현 원칙:

- `공공데이터로 확정` 금지
- `정확한 진단 보기` 금지
- `농약 추천 보기` 금지
- `처방 확인` 금지

## 6. 버튼 클릭 동작

권장 함수명:

```js
saveLastDiagnosisForPublicData(diagnosisResult)
goToPublicDataReport(diagnosisResult)
```

동작 순서:

```text
1. AI 결과에서 structuredDiagnosis 생성
2. localStorage.setItem('kfarmai:lastDiagnosis', JSON.stringify(structuredDiagnosis))
3. crop/symptom query를 보조로 붙임
4. public-data.html로 이동
```

권장 이동 URL:

```text
public-data.html?crop=고추&symptom=잎말림
```

실제 데이터 전달 우선순위:

1. `localStorage.kfarmai:lastDiagnosis`
2. URL query `crop`, `symptom`
3. 직접 입력

URL query는 공유와 디버깅을 위한 보조값이다. 전체 `aiCandidates`는 길기 때문에 localStorage를 우선한다.

## 7. public-data.html 수신 규칙

`public-data.html`은 현재 다음 흐름을 유지한다.

```text
1. URL query 확인
2. localStorage kfarmai:lastDiagnosis 확인
3. 직접 입력값 사용
```

다음 단계 구현에서는 `readDiagnosisContext()`가 `aiCandidates`, `symptomKeywords`, `growthStage`를 보존해 `KFPublicDataMatchingEngine`으로 넘기도록 보강한다.

보고서 생성:

```js
const result = KFPublicDataMatchingEngine.matchDiagnosisToPublicData(diagnosis);
```

보고서 표시 항목:

- 공공데이터 매칭 보고서
- 작물·증상
- 매칭 상태
- AI 참고 진단 후보 chip
- 매칭 결과 요약
- 출처별 확인한 점
- 추가 검증
- 주의문구

## 8. 데이터 생성 규칙

AI 결과 원문에서 구조화 데이터로 변환할 때 아래 기준을 사용한다.

### crop

- 작물명 입력값 우선
- AI가 추정한 대표 작물명 보조
- 모호하면 `미입력` 대신 빈 문자열로 저장하고 public-data에서 직접 입력을 유도

### symptom

- 사용자가 입력한 증상 키워드 우선
- AI가 요약한 대표 증상 보조
- 여러 증상이 있으면 대표 증상 1개와 `symptoms` 배열을 함께 저장

### aiCandidates

각 후보는 아래 형태로 정리한다.

```json
{
  "name": "해충 피해 가능성",
  "category": "pest",
  "keywords": ["진딧물", "총채벌레", "해충"],
  "reason": "잎 말림과 신엽 위축은 흡즙성 해충 피해와 함께 확인할 수 있습니다."
}
```

category는 아래 중 하나만 사용한다.

- `pest`
- `disease`
- `environment`
- `nutrition`
- `water`
- `management`
- `unknown`

## 9. 오류와 예외 처리

localStorage 저장 실패:

- 사용자의 브라우저 저장소 제한 또는 private mode 가능성
- 버튼 클릭 시 URL query만으로 `public-data.html` 이동
- public-data에서는 fallback 보고서 표시

AI 결과에 crop/symptom이 부족한 경우:

- `public-data.html`로 이동하되 직접 입력 카드가 보이도록 처리
- 메시지: `작물명과 증상을 입력하면 확인 경로를 정리해드립니다.`

localStorage JSON이 깨진 경우:

- console.warn에 key와 단계명만 남김
- token, user object, 이미지 binary 출력 금지
- 화면은 직접 입력 모드로 fallback

매칭 케이스가 없는 경우:

- `일반 확인 항목 안내` 보고서 표시
- NCPMS, 농약안전정보, 농업날씨, 재배가이드, 관계기관 확인 안내

## 10. 보안·개인정보 원칙

- API 키를 localStorage에 저장하지 않는다.
- Supabase session, token, user object를 저장하지 않는다.
- 이미지 binary를 localStorage에 저장하지 않는다.
- `imageUrl`은 이미 저장된 공개/허용 URL 또는 null만 사용한다.
- PSIS/NCPMS 인증키는 프론트 JS에 넣지 않는다.
- service_role key를 브라우저에서 사용하지 않는다.

## 11. 금지 표현

AI 결과 화면과 공공데이터 보고서 연결 버튼 주변에서 금지:

- 정확한 진단
- 확정 진단
- 최종 처방
- AI 진단이 맞습니다
- 공공데이터로 확정되었습니다
- 이 병입니다
- 이 농약을 쓰세요
- 추천 농약
- 오늘 방제하세요
- 방제 적기

허용:

- AI 참고 진단
- 원인 후보
- 공공데이터로 확인
- 공공데이터 매칭 보고서
- 출처 기준 확인 항목
- 추가 검증 권장
- 관계기관 확인 권장
- 참고자료

## 12. 구현 위치 후보

현재 확인해야 할 구현 위치:

- `index.html`
  - 홈 AI 참고 탭 결과 렌더링
  - `AI 참고 진단 시작` 이후 결과 표시 영역
  - `공공데이터 확인` 버튼이 이미 있는 경우 연결 보강

- `diagnosis.html`
  - 별도 AI 참고 진단 페이지가 사용된다면 동일 함수 적용

공통 함수 후보:

```js
function buildStructuredDiagnosis(displayResult, inputContext) {}
function saveLastDiagnosisForPublicData(structuredDiagnosis) {}
function goToPublicDataReport(structuredDiagnosis) {}
```

중복 방지를 위해 같은 로직이 `index.html`과 `diagnosis.html`에 흩어져 있으면 후속 단계에서 공통 JS 파일 분리를 검토한다.

## 13. 구현 단계 제안

1단계: AI 참고 진단 결과 렌더링 함수 위치 확인

2단계: AI 결과에서 crop, symptom, aiCandidates 추출 가능 여부 확인

3단계: `buildStructuredDiagnosis()` 추가

4단계: `saveLastDiagnosisForPublicData()` 추가

5단계: 결과 화면에 `공공데이터로 확인` 버튼 연결

6단계: 버튼 클릭 시 localStorage 저장 후 `public-data.html?crop=...&symptom=...` 이동

7단계: `public-data.html`에서 `aiCandidates` 보존 확인

8단계: 대표 4개 케이스와 fallback 수동 테스트

9단계: 모바일 Safari에서 버튼 1회 터치 이동 확인

10단계: 마이페이지 저장은 별도 후속 작업으로 분리

## 14. 테스트 시나리오

### 고추 잎말림

1. AI 참고 진단에서 고추 잎말림 입력
2. 결과 생성
3. `공공데이터로 확인` 클릭
4. `public-data.html` 이동
5. 고추·잎말림 보고서 표시
6. 후보 chip 표시
7. NCPMS, PSIS, 농업날씨, 재배가이드, 관계기관 표시

### 토마토 반점

1. 토마토 반점 입력
2. 결과 생성
3. 공공데이터 보고서 이동
4. 토마토·반점 대표 케이스 표시

### fallback

1. 상추 끝마름 입력
2. 결과 생성
3. 공공데이터 보고서 이동
4. `일반 확인 항목 안내` 표시

### 저장 실패

1. localStorage 저장 실패를 강제로 유도
2. URL query만으로 이동
3. 직접 입력 또는 fallback 보고서 표시
4. 화면이 깨지지 않음

## 15. 완료 기준

- AI 참고 진단 결과 화면에서 `공공데이터로 확인` 버튼이 보인다.
- 버튼 1회 클릭으로 `public-data.html`로 이동한다.
- 이동 전 `kfarmai:lastDiagnosis`가 저장된다.
- `public-data.html`이 저장된 데이터로 보고서를 표시한다.
- 대표 4개 케이스가 매칭된다.
- 없는 조합은 fallback 보고서를 표시한다.
- 금지 표현이 없다.
- 인증키, token, user object가 저장되지 않는다.
- 모바일에서 버튼이 정상 터치된다.

## 16. 후속 구현 지시어 초안

```text
C:\Users\user\PERSONAL\dev\kfarmai-web 폴더에서 작업한다.

먼저 AGENTS.md를 반드시 읽고 지침을 따른다.

이번 작업은 AI 참고 진단 완료 화면에서 공공데이터 매칭 보고서로 이동하는 연결을 구현한다.

참고 문서:
- docs/kFarmAI_AI진단_공공데이터보고서_연결_설계.md
- docs/kFarmAI_AI진단결과_공공데이터매칭용_데이터설계.md
- docs/kFarmAI_공공데이터_매칭엔진_설계.md

요구:
1. AI 참고 진단 결과 렌더링 위치를 찾는다.
2. 결과에서 crop, symptom, aiCandidates를 구조화한다.
3. structuredDiagnosis를 localStorage kfarmai:lastDiagnosis에 저장한다.
4. 결과 화면에 공공데이터로 확인 버튼을 연결한다.
5. 버튼 클릭 시 public-data.html?crop=...&symptom=... 으로 이동한다.
6. public-data.html에서 저장된 aiCandidates가 보고서 chip에 반영되는지 확인한다.
7. AI 진단 로직 자체는 바꾸지 않는다.
8. 농약 추천, 확정 진단, 최종 처방 표현은 금지한다.
9. API key, token, user object, 이미지 binary를 저장하지 않는다.

테스트:
- 고추 잎말림
- 토마토 반점
- 딸기 잿빛곰팡이
- 벼 도열병
- fallback 조합
- 모바일 버튼 터치
- git diff --check

추천 커밋 메시지:
feat: connect ai diagnosis to public data report
```

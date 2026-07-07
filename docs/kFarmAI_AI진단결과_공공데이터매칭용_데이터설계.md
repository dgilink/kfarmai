# kFarmAI AI 진단 결과 데이터 설계

## 1. 설계 목적

kFarmAI의 AI 참고 진단 결과는 사용자가 읽기 쉬운 결과와, 공공데이터 매칭에 사용할 구조화 데이터를 함께 가져야 한다.

목적:

- AI 진단 결과를 화면에 쉽게 보여준다.
- AI 결과를 공공데이터 매칭 페이지로 전달한다.
- NCPMS, 농약안전정보, 농업날씨, 재배가이드 등과 연결할 수 있게 한다.
- 사용자가 AI 결과만 저장하거나, 공공데이터 매칭 보고서로 확장할 수 있게 한다.
- 마이페이지에 AI 진단 기록과 공공데이터 매칭 보고서를 저장할 수 있게 한다.

핵심 문장:

```text
AI 진단 결과는 “사람이 읽는 요약”과 “공공데이터 매칭용 데이터”를 동시에 생성해야 한다.
```

## 2. 전체 흐름

```text
사용자 사진/문자 입력
↓
AI 참고 진단
↓
사용자 표시용 결과 생성
↓
공공데이터 매칭용 구조화 데이터 생성
↓
사용자 선택
1. 이 결과 저장하기
2. 공공데이터로 매칭하기
3. 다시 진단하기
↓
공공데이터 매칭 선택 시 public-data.html 또는 매칭 모듈로 전달
↓
공공데이터 출처별 확인 항목 매칭
↓
1장 보고서 생성
↓
마이페이지 저장
```

## 3. AI 진단 결과는 2개 레이어로 구성

AI 진단 결과는 아래 두 레이어로 나눈다.

### 3.1 사용자 표시용 결과

- 사람이 읽는 쉬운 문장
- 큰 글씨 카드
- 원인 후보 chip
- 주의문구
- 다음 선택 버튼

### 3.2 공공데이터 매칭용 구조화 데이터

- crop
- symptom
- symptomKeywords
- aiCandidates
- matchingTargets
- confidenceLevel
- cautionText
- sourceHints

주의:

사용자 화면에는 너무 복잡한 JSON을 보여주지 않는다. 하지만 내부적으로는 매칭 가능한 데이터 형태를 반드시 유지한다.

## 4. 사용자 표시용 결과 구조

AI 진단 결과 화면에는 아래만 간단히 보여준다.

```text
AI 참고 진단 결과

고추 · 잎말림

가능한 원인 후보
[해충 피해 가능성] [바이러스성 증상 가능성] [고온·건조 스트레스]

간단 요약
잎이 말리는 증상은 해충, 바이러스성 증상, 환경 스트레스가 함께 원인이 될 수 있습니다.

주의
사진만으로는 확정 진단할 수 없습니다.

선택 버튼
[공공데이터로 매칭하기]
[이 결과 저장하기]
[다시 진단하기]
```

표현 원칙:

- 짧게
- 크게
- 쉬운 말
- 병명 확정 금지
- 농약 추천 금지
- 사용자가 다음 행동을 고를 수 있게

## 5. 공공데이터 매칭용 데이터 구조

아래 JSON 구조를 기본 설계로 제안한다.

```json
{
  "diagnosisId": "local-or-db-id",
  "createdAt": "2026-07-07T10:00:00+09:00",
  "inputType": "image_text",
  "crop": "고추",
  "cropCandidates": ["고추", "청양고추"],
  "symptom": "잎말림",
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
      "reason": "잎이 말리거나 신엽이 위축되는 증상은 흡즙성 해충 피해와 함께 확인할 수 있습니다.",
      "matchTargets": ["ncpms", "psis"]
    },
    {
      "name": "바이러스성 증상 가능성",
      "category": "disease",
      "keywords": ["바이러스", "모자이크", "위조", "토마토반점위조바이러스"],
      "reason": "잎 말림과 생육 이상은 바이러스성 증상과 함께 확인할 수 있습니다.",
      "matchTargets": ["ncpms"]
    },
    {
      "name": "고온·건조 스트레스 가능성",
      "category": "environment",
      "keywords": ["고온", "건조", "수분부족", "환경스트레스"],
      "reason": "고온과 건조한 환경에서는 잎 말림이나 생육 저하가 나타날 수 있습니다.",
      "matchTargets": ["agriWeather", "cropGuide"]
    }
  ],
  "matchingTargets": ["ncpms", "psis", "agriWeather", "cropGuide"],
  "confidenceLevel": "reference",
  "needPublicDataMatching": true,
  "cautionText": "사진과 입력 정보만으로는 확정 진단할 수 없습니다.",
  "nextActions": [
    "공공데이터 매칭 보고서 생성",
    "AI 진단 결과 저장",
    "관계기관 상담"
  ],
  "imageUrl": null
}
```

## 6. 필드별 설명

### 6.1 필수 필드

| 필드 | 의미 |
|---|---|
| diagnosisId | 진단 결과 식별자 |
| createdAt | 생성일 |
| inputType | image, text, image_text |
| crop | 대표 작물명 |
| symptom | 대표 증상명 |
| symptomKeywords | 매칭용 증상 키워드 |
| aiSummary | 사용자용 요약 |
| aiCandidates | 원인 후보 목록 |
| matchingTargets | 연결할 공공데이터 출처 |
| confidenceLevel | 참고 수준 |
| cautionText | 주의문구 |

### 6.2 선택 필드

- cropCandidates
- region
- cultivationType
- growthStage
- imageUrl
- sourceHints

### 6.3 aiCandidates 내부 필드

| 필드 | 의미 |
|---|---|
| name | 사용자에게 보여줄 원인 후보명 |
| category | pest / disease / environment / nutrition / water / management / unknown |
| keywords | 공공데이터 검색용 키워드 |
| reason | 간단한 이유 |
| matchTargets | 연결할 출처 |

## 7. category 기준

| category | 기준 |
|---|---|
| pest | 해충, 진딧물, 총채벌레, 응애, 나방류 등 |
| disease | 병, 곰팡이, 바이러스, 세균성 병, 잿빛곰팡이, 도열병 등 |
| environment | 고온, 저온, 건조, 과습, 강풍, 일조부족 등 |
| nutrition | 양분 부족, 질소, 칼슘, 마그네슘, 비료 과다 등 |
| water | 물 부족, 과습, 배수불량, 뿌리 스트레스 등 |
| management | 분갈이, 전정, 밀식, 통풍 부족, 재배관리 문제 등 |
| unknown | 정보 부족, 사진 불명확, 추가 확인 필요 |

## 8. matchingTargets 기준

| target | 기준 |
|---|---|
| ncpms | 병해충, 바이러스, 세균, 곰팡이, 해충 후보가 있을 때 |
| psis | 농약 사용 가능성, 대상 병해충, 등록작물, 안전사용기준 확인이 필요할 때 |
| agriWeather | 고온, 저온, 건조, 과습, 강수, 습도, 강풍 등 환경 후보가 있을 때 |
| cropGuide | 재배관리, 생육단계, 물관리, 비료관리, 환경관리 후보가 있을 때 |
| nongsaro | 작목별 재배기술, 일반 재배관리, 기술자료 확인이 필요할 때 |
| localAgency | 피해 확산, 확정 판단 필요, 사진 상담 필요, 지역 상황 확인 필요할 때 |

주의:

`matchingTargets`는 “링크 추천”이 아니라 공공데이터 매칭 보고서 생성용 대상이다.

## 9. AI 결과 화면의 사용자 선택권

AI 진단 결과 화면에는 아래 버튼을 제공한다.

### 9.1 공공데이터로 매칭하기

- 구조화 데이터를 `public-data.html` 또는 매칭 모듈로 전달
- 공공데이터 매칭 보고서 생성

### 9.2 이 결과 저장하기

- AI 참고 진단 결과만 저장
- 마이페이지 AI 진단 기록에 저장

### 9.3 다시 진단하기

- 입력 화면으로 돌아감

중요:

사용자는 AI 결과만 보고 만족할 수도 있다. 더 확인하고 싶은 사용자는 공공데이터 매칭으로 넘어간다.

## 10. public-data.html로 전달 방식

초기 구현 방식:

- localStorage 사용

저장 key:

```js
kfarmai:lastDiagnosis
```

저장 예시:

```js
localStorage.setItem('kfarmai:lastDiagnosis', JSON.stringify(diagnosisResult));
```

이동:

```js
location.href = 'public-data.html';
```

`public-data.html`에서는 아래 순서로 읽는다.

1. URL query
2. localStorage `kfarmai:lastDiagnosis`
3. 직접 입력

URL query 예시:

```text
public-data.html?crop=고추&symptom=잎말림
```

단, `aiCandidates`가 길기 때문에 전체 구조화 데이터는 localStorage 사용을 우선한다.

장기 구현:

- Supabase `diagnosis_reports` 또는 `diagnosis_sessions` 테이블 저장 후 id로 전달

예:

```text
public-data.html?diagnosisId=xxxx
```

## 11. 마이페이지 저장 구조

AI 결과 저장과 공공데이터 매칭 보고서 저장은 구분한다.

### 11.1 AI 진단 기록

- AI가 생성한 참고 진단 결과
- 공공데이터 매칭 전 상태

### 11.2 공공데이터 매칭 보고서

- AI 진단 결과를 공공데이터 출처와 연결한 1장 보고서

마이페이지 구분 예:

- AI 진단 기록
- 공공데이터 매칭 보고서

또는 하나로 묶어서:

- 내 진단 기록
  - AI 진단
  - 공공데이터 매칭 완료

초기 localStorage key:

```text
kfarmai:diagnosisHistory
kfarmai:publicDataReports
```

장기 Supabase 테이블 후보:

- diagnosis_sessions
- diagnosis_reports

## 12. 금지 표현

AI 결과와 공공데이터 매칭 결과 모두 아래 표현 금지.

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

허용 표현:

- 참고 진단
- 원인 후보
- 가능성
- 관련 항목
- 공공데이터 매칭
- 출처 기준 확인 항목
- 추가 검증 권장
- 관계기관 확인 권장

## 13. 고추 잎말림 예시 전체

### 13.1 사용자 표시용

```text
AI 참고 진단 결과

고추 · 잎말림

가능한 원인 후보
[해충 피해 가능성] [바이러스성 증상 가능성] [고온·건조 스트레스]

간단 요약
잎이 말리는 증상은 해충, 바이러스성 증상, 환경 스트레스가 함께 원인이 될 수 있습니다.

주의
사진만으로는 확정 진단할 수 없습니다.

선택
[공공데이터로 매칭하기]
[이 결과 저장하기]
[다시 진단하기]
```

### 13.2 구조화 데이터

```json
{
  "diagnosisId": "local-pepper-leaf-curl-001",
  "createdAt": "2026-07-07T10:00:00+09:00",
  "inputType": "image_text",
  "crop": "고추",
  "cropCandidates": ["고추", "청양고추"],
  "symptom": "잎말림",
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
      "reason": "잎이 말리거나 신엽이 위축되는 증상은 흡즙성 해충 피해와 함께 확인할 수 있습니다.",
      "matchTargets": ["ncpms", "psis"]
    },
    {
      "name": "바이러스성 증상 가능성",
      "category": "disease",
      "keywords": ["바이러스", "모자이크", "위조", "토마토반점위조바이러스"],
      "reason": "잎 말림과 생육 이상은 바이러스성 증상과 함께 확인할 수 있습니다.",
      "matchTargets": ["ncpms"]
    },
    {
      "name": "고온·건조 스트레스 가능성",
      "category": "environment",
      "keywords": ["고온", "건조", "수분부족", "환경스트레스"],
      "reason": "고온과 건조한 환경에서는 잎 말림이나 생육 저하가 나타날 수 있습니다.",
      "matchTargets": ["agriWeather", "cropGuide"]
    }
  ],
  "matchingTargets": ["ncpms", "psis", "agriWeather", "cropGuide"],
  "confidenceLevel": "reference",
  "needPublicDataMatching": true,
  "cautionText": "사진과 입력 정보만으로는 확정 진단할 수 없습니다.",
  "nextActions": [
    "공공데이터 매칭 보고서 생성",
    "AI 진단 결과 저장",
    "관계기관 상담"
  ],
  "imageUrl": null
}
```

## 14. 토마토 반점 예시

```json
{
  "crop": "토마토",
  "symptom": "잎 반점",
  "aiCandidates": [
    {
      "name": "곰팡이성 병 가능성",
      "category": "disease",
      "keywords": ["곰팡이", "반점", "잎 반점"],
      "matchTargets": ["ncpms", "psis"]
    },
    {
      "name": "세균성 병 가능성",
      "category": "disease",
      "keywords": ["세균성 병", "반점"],
      "matchTargets": ["ncpms", "psis"]
    },
    {
      "name": "고온다습 환경 영향",
      "category": "environment",
      "keywords": ["고온다습", "습도", "환기"],
      "matchTargets": ["agriWeather", "cropGuide"]
    }
  ],
  "matchingTargets": ["ncpms", "psis", "agriWeather", "cropGuide"],
  "aiSummary": "토마토 잎 반점은 병해 가능성과 고온다습 환경을 함께 확인할 수 있습니다."
}
```

## 15. 딸기 잿빛곰팡이 예시

```json
{
  "crop": "딸기",
  "symptom": "잿빛곰팡이 의심",
  "aiCandidates": [
    {
      "name": "곰팡이성 병 가능성",
      "category": "disease",
      "keywords": ["잿빛곰팡이", "곰팡이성 병"],
      "matchTargets": ["ncpms", "psis"]
    },
    {
      "name": "과습·통풍 부족 가능성",
      "category": "environment",
      "keywords": ["과습", "통풍 부족", "습도"],
      "matchTargets": ["agriWeather", "cropGuide"]
    },
    {
      "name": "시설 내 습도 영향",
      "category": "environment",
      "keywords": ["시설재배", "습도", "환기"],
      "matchTargets": ["agriWeather", "cropGuide"]
    }
  ],
  "matchingTargets": ["ncpms", "psis", "agriWeather", "cropGuide"],
  "aiSummary": "딸기 잿빛곰팡이 의심 증상은 곰팡이성 병과 습도·통풍 조건을 함께 확인할 수 있습니다."
}
```

## 16. 벼 도열병 예시

```json
{
  "crop": "벼",
  "symptom": "도열병 의심",
  "aiCandidates": [
    {
      "name": "병해 가능성",
      "category": "disease",
      "keywords": ["도열병", "잎도열", "이삭도열"],
      "matchTargets": ["ncpms", "psis", "nongsaro"]
    },
    {
      "name": "고습 환경 영향",
      "category": "environment",
      "keywords": ["고습", "강수", "습도"],
      "matchTargets": ["agriWeather"]
    },
    {
      "name": "품종·생육단계 영향",
      "category": "management",
      "keywords": ["품종", "생육단계", "재배관리"],
      "matchTargets": ["nongsaro", "cropGuide"]
    }
  ],
  "matchingTargets": ["ncpms", "psis", "agriWeather", "nongsaro"],
  "aiSummary": "벼 도열병 의심 증상은 병해 정보, 날씨 조건, 생육단계를 함께 확인할 수 있습니다."
}
```

## 17. 구현 단계 제안

1. 현재 AI 진단 결과 화면의 출력 구조 확인
2. AI 진단 결과를 사용자용 `displayResult`와 매칭용 `structuredResult`로 분리
3. `structuredResult`를 localStorage `kfarmai:lastDiagnosis`에 저장
4. AI 결과 화면에 선택 버튼 추가
   - 공공데이터로 매칭하기
   - 이 결과 저장하기
   - 다시 진단하기
5. `public-data.html`에서 `kfarmai:lastDiagnosis` 읽기
6. 공공데이터 매칭 보고서 생성
7. 마이페이지 저장 기능 연결
8. Supabase 저장으로 확장

## 18. 후속 Codex 지시어 초안

### 18.1 AI 진단 결과를 displayResult / structuredResult로 분리하는 구현 지시어

```text
C:\Users\user\PERSONAL\dev\kfarmai-web 폴더에서 작업한다.

먼저 AGENTS.md를 반드시 읽고 지침을 따른다.
docs/kFarmAI_AI진단결과_공공데이터매칭용_데이터설계.md를 읽는다.

이번 작업은 AI 진단 결과를 사용자 표시용 displayResult와 공공데이터 매칭용 structuredResult로 분리하는 작업이다.
AI 프롬프트/응답 후처리에서 crop, symptom, symptomKeywords, aiCandidates, matchingTargets, cautionText를 생성한다.
기존 AI 참고 진단 화면 문구와 안전 표현은 유지한다.
DB 스키마 변경과 SQL 실행은 하지 않는다.
```

### 18.2 AI 진단 결과 화면에 선택 버튼을 추가하는 구현 지시어

```text
C:\Users\user\PERSONAL\dev\kfarmai-web 폴더에서 작업한다.

먼저 AGENTS.md를 반드시 읽고 지침을 따른다.
docs/kFarmAI_AI진단결과_공공데이터매칭용_데이터설계.md를 읽는다.

이번 작업은 AI 참고 진단 결과 화면에 선택 버튼을 추가하는 작업이다.
버튼은 공공데이터로 매칭하기, 이 결과 저장하기, 다시 진단하기 3개로 구성한다.
공공데이터로 매칭하기 클릭 시 structuredResult를 localStorage kfarmai:lastDiagnosis에 저장하고 public-data.html로 이동한다.
기존 AI 진단 실행 로직은 바꾸지 않는다.
```

### 18.3 public-data.html에서 kfarmai:lastDiagnosis를 읽어 공공데이터 매칭 보고서를 생성하는 구현 지시어

```text
C:\Users\user\PERSONAL\dev\kfarmai-web 폴더에서 작업한다.

먼저 AGENTS.md를 반드시 읽고 지침을 따른다.
docs/kFarmAI_AI진단결과_공공데이터매칭용_데이터설계.md와 docs/kFarmAI_공공데이터_매칭_1장보고서_설계.md를 읽는다.

이번 작업은 public-data.html에서 localStorage kfarmai:lastDiagnosis를 읽어 공공데이터 매칭 1장 보고서를 표시하는 작업이다.
URL query가 있으면 URL query를 우선하고, 없으면 localStorage를 읽는다.
aiCandidates와 matchingTargets를 기반으로 출처별 확인 항목을 표시한다.
확정 진단, 최종 처방, 농약 추천, 방제 지시 표현은 사용하지 않는다.
```

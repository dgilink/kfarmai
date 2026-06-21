# kFarmAI 10시간 연속 SEO 초안 생성기 사용법

## 핵심 결론

가능합니다.  
다만 10시간 동안 바로 공개글을 자동 발행하는 방식은 비추천입니다.

권장 구조는 다음과 같습니다.

질문 후보 생성  
→ SEO 초안 생성  
→ HTML 파일 생성  
→ sitemap.xml 갱신  
→ robots.txt 갱신  
→ draft 상태로 저장  
→ 사람이 검수  
→ 배포

이 방식이면 구글 SEO 품질 리스크, 농약/병해충 오답 리스크, 중복 콘텐츠 리스크를 줄일 수 있습니다.

---

## 파일

- `kfarmai_10h_seo_worker.py`

---

## 설치 필요 여부

기본 Python만 있으면 실행됩니다.  
외부 라이브러리 설치가 필요 없습니다.

---

## 작업 폴더 예시

대표님 프론트엔드 폴더:

```powershell
cd C:\Users\user\PERSONAL\dev\kfarmai\02_dev\frontend
```

위 폴더에 `kfarmai_10h_seo_worker.py` 파일을 넣습니다.

---

## 30분 테스트 실행

처음부터 10시간 돌리지 말고 30분 테스트를 먼저 권장합니다.

```powershell
python kfarmai_10h_seo_worker.py --root . --hours 0.5 --interval 60 --max-items 20
```

생성 결과:

```text
data/seo_drafts.json
kb/*.html
kb/index.html
sitemap.xml
robots.txt
logs/seo_worker.log
```

---

## 10시간 실행

```powershell
python kfarmai_10h_seo_worker.py --root . --hours 10 --interval 90 --max-items 300
```

의미:

- 10시간 동안 실행
- 90초마다 1개 초안 생성
- 최대 300개까지만 생성

---

## 권장 설정

### 안전한 설정

```powershell
python kfarmai_10h_seo_worker.py --root . --hours 10 --interval 180 --max-items 150
```

3분마다 1개, 최대 150개입니다.  
처음에는 이 정도가 더 안전합니다.

### 빠른 테스트 설정

```powershell
python kfarmai_10h_seo_worker.py --root . --hours 0.2 --interval 30 --max-items 10
```

---

## 생성되는 글 상태

모든 글은 기본적으로 `"status": "draft"`입니다.

즉, 자동 생성은 되지만 바로 공개 발행으로 간주하지 않습니다.  
검수 후 발행하는 구조입니다.

---

## 왜 자동 발행이 아니라 draft인가?

농업 콘텐츠는 일반 블로그와 다릅니다.

특히 아래 주제는 오답 위험이 있습니다.

- 농약
- 약제
- 혼용
- 병해충
- 방제
- 희석배수
- 작물 처방
- 보조사업 신청 기간

그래서 초안 생성은 자동화하되, 발행은 사람이 확인하는 구조가 맞습니다.

---

## 이 코드가 하는 일

1. 농업/식물 질문 후보에서 하나 선택
2. 중복 질문인지 확인
3. SEO 제목 생성
4. slug 생성
5. meta description 생성
6. 답변 섹션 생성
7. FAQ 생성
8. 공식기관 출처 삽입
9. 농약/병해충 키워드가 있으면 주의문구 삽입
10. `kb/{slug}.html` 생성
11. `kb/index.html` 갱신
12. `sitemap.xml` 갱신
13. `robots.txt` 갱신
14. `logs/seo_worker.log` 기록

---

## 현재 버전의 한계

이 코드는 API 없이 돌아가는 규칙 기반 초안 생성기입니다.

즉, 답변 문장이 매우 정교하지는 않습니다.  
대신 안전하고, 빠르고, 바로 실행 가능합니다.

나중에 OpenAI, Gemini, Claude API를 붙이면 다음처럼 확장할 수 있습니다.

- 질문 자동 확장
- 공식자료 검색
- 출처별 요약
- 답변 품질 개선
- 사용자 검색어 기반 신규 글 생성
- 관리자 승인 화면 구축

---

## Google Search Console 관련

이 코드는 `sitemap.xml`을 자동 갱신합니다.

하지만 일반 SEO 글을 Google Indexing API로 강제 색인 요청하는 방식은 권장하지 않습니다.  
정석 방식은 다음과 같습니다.

1. sitemap.xml 자동 생성
2. robots.txt에 sitemap 등록
3. Google Search Console에서 sitemap 제출
4. 내부 링크로 크롤링 유도
5. 검색 노출 데이터 확인
6. 유입 키워드 기반으로 글 확장

---

## 배포 전 확인 체크리스트

1. `kb/index.html` 열리는지 확인
2. 생성된 글 HTML이 모바일에서 깨지지 않는지 확인
3. 출처 링크가 정상인지 확인
4. 농약 관련 글에 주의문구가 있는지 확인
5. `sitemap.xml`에 URL이 들어갔는지 확인
6. `robots.txt`에 Sitemap 줄이 있는지 확인
7. 기존 `index.html`, `agri_map.html` 등이 깨지지 않았는지 확인
8. draft 글 중 품질 낮은 글은 삭제 또는 수정
9. 검수 완료 글만 배포

---

## 추천 운영 방식

처음 1일차:

```powershell
python kfarmai_10h_seo_worker.py --root . --hours 0.5 --interval 60 --max-items 20
```

2일차:

- 생성글 20개 검수
- 제목 수정
- 답변 보강
- 출처 확인

3일차:

```powershell
python kfarmai_10h_seo_worker.py --root . --hours 3 --interval 120 --max-items 80
```

그다음:

- Search Console 등록
- 유입 키워드 확인
- 클릭 많은 주제 위주로 추가 글 생성

---

## 최종 권장

처음부터 10시간 풀가동은 기술적으로 가능하지만, SEO 품질상 바로 권장하지 않습니다.

추천은 다음입니다.

1. 30분 테스트
2. 20개 글 확인
3. 구조 수정
4. 3시간 실행
5. 80~100개 확보
6. Search Console 등록
7. 10시간 실행은 그 다음

kFarmAI는 글 수보다 “실제 농민 질문과 공식 출처 기반 신뢰도”가 더 중요합니다.

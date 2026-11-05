# KFarmAI 기관별 공식자료 배지 제작 규칙 (2026-11-05)

## 고정 디자인
- 공식 원문 CTA 배지는 100% 클릭 가능한 이미지 링크로 제작한다. 반드시 해당 공고·보도자료의 **개별 원문 URL**에 연결하고, 기관 메인 화면 링크로 대체하지 않는다.
- 모든 배지는 **각진 직사각형**으로 제작한다. border-radius=0; 라운드 모서리 금지.
- 텍스트는 **한 줄**, 굵고 크게, 고대비로 만든다. 모바일 360px·390px에서 텍스트 잘림·겹침을 검사한다.
- 외부 링크에는 target="_blank" rel="noopener noreferrer"를 사용한다. 배지에는 alt 및 클릭 목적을 표시한다.
- 독립된 official-source-badge와 기존 관련 글 내부링크 related-badge는 목적이 다르므로 유지·구분한다.
- 기사별 인포그래픽 최소 2장·기존 관련 글 내부링크·실사형 대표이미지 규칙을 유지한다.

## 기관별 고정색 (KFarmAI 편집용 팔레트)
다음 색은 **각 기관의 법정 CI 지정색을 의미하지 않는 KFarmAI 자체 배지 고정색**이다.

| 기관 | 배경 | 강조/테두리 | 기본 글자 |
| --- | --- | --- | --- |
| 농림축산식품부 | #071F55 | #FFE700 | #FFFFFF |
| 의성군 | #086922 | #FFF000 | #FFFFFF |
| 기업마당 | #F46A12 | #071F55 (강조 #FFF000) | #FFFFFF |

- 기관명이 같은 경우 향후에도 색을 임의 변경하지 않는다.
- 새로운 기관은 처음 사용할 때 새로운 구분색을 확정하고 이 표에 추가한다.
- 소스 저장소 asset 경로: static/kb/official-cta-<agency>-vN.svg, 버전형 이름 사용.

## 2026-11-05 적용 4편
- 꿀벌응애 집중 방제: official-cta-mafra-official-v1.svg → 농식품부 개별 원문
- 의성 청년농 창농기반: official-cta-uiseong-notice-v1.svg → 의성군 개별 공지
- 익산 농촌융복합산업: official-cta-bizinfo-notice-v1.svg → 기업마당 개별 공고
- 2027 농어촌 기본소득: official-cta-mafra-press-v1.svg → 농식품부 개별 보도자료

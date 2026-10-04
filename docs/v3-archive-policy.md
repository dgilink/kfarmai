# V3 레거시·ARCHIVE 노출 정책

| 대상 | 상태 | Navigation | Feed | 통합검색 | Sitemap | 직접 URL |
|---|---|---:|---:|---:|---:|---:|
| V3 4분류 커뮤니티 | ACTIVE | 포함 | 포함 | 포함 | 유지 | 유지 |
| 나눔·직거래 기존 글 | ARCHIVE | 제외 | 제외 | 제외 | 제외 | 읽기 전용 유지 |
| `search_result.html` | ARCHIVE | 제외 | 해당 없음 | V3 통합검색으로 redirect | 제외 | 호환 redirect 유지 |
| contest/demo 소개 페이지 | HIDDEN | 핵심 navigation 제외 | 제외 | 제외 | REMOVE-LATER | 당분간 유지 |
| MVP/과거 실험 페이지 | REMOVE-LATER | 제외 | 제외 | 제외 | 제외 | SEO 조사 후 처리 |
| 과거 8채널 URL | ARCHIVE | 제외 | canonical 4분류로만 노출 | canonical 4분류로만 노출 | 후속 SEO에서 정리 | 호환 읽기 유지 |

나눔·직거래는 신규 글쓰기 제외, Feed 제외, 통합검색 제외를 기본 정책으로 하며 기존 직접 URL만 읽기 전용으로 유지한다.

`search_result.html`의 Render API 호출은 제거했다. 이전 링크의 `q` 값은 V3 홈 전체화면 질문검색으로 전달한다. 파일은 외부 URL 호환을 위해 삭제하지 않고 `noindex,follow`와 홈 canonical을 적용한다.

대량 삭제와 sitemap 전면 변경은 이 Phase에 포함하지 않는다. 외부 색인·유입 확인 후 REMOVE-LATER 항목을 별도 승인으로 처리한다.

# V3 Phase 4A 커뮤니티 데이터 계약

## 목적 분류와 legacy 매핑

| 기존 채널 | 기존 UUID | V3 분류 | 전환 상태 |
|---|---|---|---|
| 식물 병원 (`plant-hospital`) | `d88ba519-68fd-488f-8311-e316838ac4cf` | 질문·문제해결 | LEGACY |
| 식물 질문방 (`plant-question`) | `c7315bd6-eb60-484c-9c07-6def8f93ddc1` | 질문·문제해결 | LEGACY |
| 작물 상담방 (`crop-consult`) | `f586c6a8-882a-45d0-89e6-6d20fd9675de` | 질문·문제해결 | LEGACY |
| 원예 클래스 (`garden-class`) | `a6095ae4-1d7e-4671-a6b1-4277d343e586` | 재배·노하우 | LEGACY |
| 내 식물 자랑 (`plant-brag`) | `9191bf52-84b6-42ca-b2c7-c886bde5d450` | 자랑·일상 | LEGACY |
| 식집사 모임 (`plant-meet`) | `ae71a389-0723-4e76-b421-789a1474fd49` | 자랑·일상 | LEGACY |
| 농부 사랑방 (`farmer-lounge`) | `364c2c71-c313-47fc-a986-3124393bf381` | 농업·현장정보 | LEGACY |
| 나눔·직거래 (`plant-share`) | `4619a407-a214-4555-8e63-06fa96ed87a2` | 농업·현장정보 | ARCHIVE |

나눔·직거래의 기존 글은 `category_id`를 부여해 보존하지만 신규 V3 분류 선택지에서는 제외한다. 결제·배송·정산·판매자 기능은 추가하지 않는다. 기존 `channels`와 `posts.channel_id`는 과거 URL과 데이터 추적을 위해 삭제하지 않는다.

## 게시글과 태그

- 신규 글은 `posts.category_id`를 사용한다. `channel_id`는 legacy 호환 필드다.
- `posts.tags text[]`는 선택값이며 최대 8개, 태그당 30자다.
- 저장 전에 공백과 `#`을 제거하고 소문자화하며 중복을 제거한다.
- `crop_tag`, `region_tag`는 전환 기간 동안 유지하고 기존 값은 `tags`에도 보강한다.
- GIN 인덱스로 `tags @> array['고추']` 형태 검색을 지원한다.

## 반응과 저장

- `same_symptom`, `helpful`은 `post_reactions`에 로그인 사용자당 글/유형별 한 행만 저장한다.
- 다시 누르면 삭제되는 toggle 계약이다.
- 공개 숫자는 `community_post_engagement()`가 집계하며 사용자 UUID 목록은 공개하지 않는다.
- 저장은 `post_bookmarks`의 개인 북마크다. 공개 count를 제공하지 않는다.
- 차단 관계가 어느 방향이든 존재하면 새 반응을 허용하지 않는다.

## 신고

- 게시글과 댓글만 신고할 수 있다.
- 신고자는 자기 신고만 조회할 수 있고 다른 사용자의 신고 및 운영 상태는 조회할 수 없다.
- 같은 신고자·대상 조합은 한 번만 저장해 반복 spam을 제한한다.
- 운영자 처리 UI와 관리자 역할 정책은 별도 운영 Phase에서 구현한다.
- 계정이 삭제되면 신고자의 UUID 연결은 `null` 처리하고 신고 내용과 처리 상태는 보존한다. 구체적인 보존기간은 개인정보·법률 검토 후 확정한다.

## 차단 표시·상호작용 정책

- 차단 목록은 차단한 사용자 본인만 조회·추가·해제한다.
- 자기 자신 차단과 중복 차단은 DB가 거부한다.
- 프런트는 게시글 상세에서 차단한 사용자의 게시글과 댓글을 숨긴다. 홈·분류·검색 목록 전역 필터와 차단 관리 화면은 Phase 4B에서 연결한다.
- 차단 관계가 어느 방향이든 새 반응을 막는다.
- 기존 공개 게시글의 REST 직접 조회를 차단하는 강한 비공개 정책은 적용하지 않는다. 공개 커뮤니티 글의 가시성과 비밀댓글 RLS를 섞지 않기 위함이다.
- 댓글 작성까지 상호 차단할지는 운영정책 결정 후 별도 migration으로 적용한다.

## 보존과 rollback

- migration은 기존 게시글·댓글·사진 URL을 삭제하거나 변경하지 않는다.
- legacy channel도 DROP하지 않는다.
- rollback SQL은 `supabase/rollback/20261002110000_v3_community_model_down.sql`에 둔다.
- rollback은 신규 반응·북마크·신고·차단 데이터와 신규 category/tag 필드를 제거하므로 적용 전 백업과 대표 승인이 필요하다.

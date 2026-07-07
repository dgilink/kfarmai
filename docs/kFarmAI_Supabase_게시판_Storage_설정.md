# kFarmAI Supabase 게시판·사진첨부 설정 문서

## 1. 이 문서의 목적

kFarmAI 게시판에서 아래 기능이 정상 동작하려면 Supabase Database RLS와 Storage bucket/policy 설정이 필요하다.

- 글 등록
- 글 수정
- 글 삭제
- 사진첨부 글 등록
- 사진첨부 글 수정
- 게시글 이미지 표시

프론트엔드는 `anon` key와 로그인 사용자의 세션으로만 동작해야 한다. `service_role` key는 브라우저 코드에 넣지 않는다. `auth.admin` 기능도 브라우저에서 직접 호출하지 않는다.

## 2. 문제 해결 기록 요약

게시판 안정화 과정에서 확인한 주요 원인은 다음과 같다.

- 글 삭제 실패 원인: `posts` 테이블에 본인 글 삭제를 허용하는 delete RLS 정책이 없으면, 프론트에서 본인 글로 판단해도 Supabase에서 삭제가 막힐 수 있다.
- 사진첨부 실패 원인: `post-images` Storage bucket이 없거나, 로그인 사용자의 upload/read 정책이 없으면 사진 업로드 또는 이미지 표시가 실패한다.
- iPhone 사진첨부 실패 가능 원인: iPhone Safari에서 파일 MIME type이 비어 있거나 HEIC/HEIF 확장자가 들어오는 경우가 있어, 프론트와 Storage 정책 모두 이미지 업로드 흐름을 고려해야 한다.

해결 후 확인된 상태로 관리해야 할 항목:

- 글 등록 정상
- 글 수정 정상
- 글 삭제 정상
- 사진첨부 글 등록 정상
- 사진첨부 수정 정상
- iPhone 사진 등록 확인

위 상태가 깨지면 먼저 RLS와 Storage policy를 확인한다.

## 3. posts 테이블 사용 컬럼

현재 프론트에서 사용하는 `posts` 컬럼:

- `id`
- `user_id`
- `channel_id`
- `title`
- `content`
- `crop_tag`
- `region_tag`
- `image_urls`
- `view_count`
- `created_at`
- `title_en`
- `content_en`

주의: 아래 컬럼은 `posts` insert/update payload에 넣지 않는다.

- `category`
- `tags`
- `author_nickname`
- `updated_at`
- `deleted_at`
- `comments_count`
- `likes_count`
- `like_count`

## 4. 글 등록 insert payload

프론트 글 등록 시 허용 payload:

```js
{
  user_id,
  channel_id,
  title,
  content,
  crop_tag,
  region_tag,
  image_urls
}
```

원칙:

- `user_id`는 반드시 현재 로그인한 `auth.users.id`를 사용한다.
- `image_urls`는 배열로 저장한다.
- 사진이 없으면 `[]` 또는 빈 배열로 처리한다.
- `category`, `tags`, `author_nickname`, `updated_at`, `deleted_at` 등 없는 컬럼은 넣지 않는다.

권장 insert 흐름:

1. 로그인 세션 확인
2. 제목/본문 등 필수값 검증
3. 사진이 있으면 Storage에 먼저 upload
4. public URL 배열을 `image_urls`로 구성
5. `posts.insert(payload)` 실행
6. 성공 후 목록/마이페이지 카운트 재조회

## 5. 글 수정 update payload

프론트 글 수정 시 허용 payload:

```js
{
  title,
  content,
  crop_tag,
  region_tag,
  image_urls
}
```

권장 update 쿼리:

```js
const { data, error } = await supabase
  .from('posts')
  .update(payload)
  .eq('id', postId)
  .eq('user_id', currentUser.id)
  .select('id,user_id,channel_id,title,content,crop_tag,region_tag,image_urls,view_count,created_at,title_en,content_en')
  .single();
```

원칙:

- `user_id`, `id`, `created_at`, `channel_id`, `view_count`는 update payload에 넣지 않는다.
- 기존 `image_urls`는 사용자가 삭제하지 않는 한 유지한다.
- 새 사진을 추가하면 기존 배열에 새 URL을 병합한다.
- Storage 실제 파일 삭제는 별도 정책과 별도 작업으로 처리한다.

## 6. 글 삭제 delete 쿼리

현재 `posts` 테이블에 `deleted_at` 컬럼을 사용하지 않으므로 soft delete가 아니라 실제 delete를 사용한다.

권장 delete 쿼리:

```js
const { data, error } = await supabase
  .from('posts')
  .delete()
  .eq('id', postId)
  .eq('user_id', currentUser.id)
  .select('id');
```

삭제 후 확인:

- `error`가 있으면 RLS 또는 DB 오류 가능성이 있다.
- `data`가 빈 배열이면 `user_id` 불일치, 이미 삭제된 글, 또는 RLS 정책 문제 가능성이 있다.
- 사용자 메시지는 `삭제 권한이 없거나 이미 삭제된 글입니다.`처럼 표시한다.
- 콘솔에는 `postId`, `hasUser`, `idsMatch`, `error.message` 정도만 남긴다.

## 7. posts RLS 정책

아래 SQL은 Supabase SQL Editor에서 관리자가 직접 확인 후 실행할 후보이다. 이 문서는 SQL을 실행하지 않는다.

```sql
alter table public.posts enable row level security;

drop policy if exists "posts_select_all" on public.posts;
create policy "posts_select_all"
on public.posts
for select
using (true);

drop policy if exists "posts_insert_own" on public.posts;
create policy "posts_insert_own"
on public.posts
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "posts_update_own" on public.posts;
create policy "posts_update_own"
on public.posts
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "posts_delete_own" on public.posts;
create policy "posts_delete_own"
on public.posts
for delete
to authenticated
using (auth.uid() = user_id);
```

정책 의도:

- 누구나 게시글 조회 가능
- 로그인 사용자는 자기 `user_id`로만 글 등록 가능
- 로그인 사용자는 본인 글만 수정 가능
- 로그인 사용자는 본인 글만 삭제 가능

## 8. Storage bucket 설정

게시글 사진첨부에 사용하는 bucket 이름:

```text
post-images
```

권장 설정:

- bucket 생성: `post-images`
- public bucket 여부: 현재 프론트가 `getPublicUrl()`을 사용하므로 public read 구조가 가장 단순하다.
- 업로드 경로 예:

```text
{user_id}/draft-{timestamp}-{random}/{filename}
{user_id}/{post_id}/{filename}
```

파일명 원칙:

- 원본 파일명을 그대로 쓰지 않는다.
- 한글, 공백, 괄호, 특수문자를 path에 직접 넣지 않는다.
- `Date.now()`와 random 문자열로 충돌을 줄인다.
- 확장자는 `jpg`, `jpeg`, `png`, `webp`, `gif`, `heic`, `heif` 후보만 허용한다.

## 9. Storage policy 후보

아래 정책은 Supabase Storage 정책 확인용 후보이다. 프로젝트 정책 이름과 bucket 설정에 맞춰 관리자가 조정해야 한다. 이 문서는 SQL을 실행하지 않는다.

인증 사용자가 `post-images`에 업로드할 수 있게 하는 정책 후보:

```sql
create policy "post_images_upload_authenticated"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'post-images'
  and auth.uid()::text = (storage.foldername(name))[1]
);
```

공개 이미지 읽기를 허용하는 정책 후보:

```sql
create policy "post_images_read_public"
on storage.objects
for select
using (bucket_id = 'post-images');
```

본인 경로의 이미지만 수정/삭제하게 할 경우의 후보:

```sql
create policy "post_images_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'post-images'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'post-images'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "post_images_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'post-images'
  and auth.uid()::text = (storage.foldername(name))[1]
);
```

주의:

- 프론트에서 Storage 파일 삭제를 수행하지 않는다면 delete policy는 당장 필수는 아니다.
- private bucket을 쓰려면 signed URL 방식으로 프론트를 별도 수정해야 한다.
- `service_role` key로 프론트 업로드를 우회하지 않는다.

## 10. image_urls 처리 원칙

`image_urls`는 게시글에 첨부된 이미지 public URL 배열이다.

정규화 함수 기준:

```js
function normalizeImageUrls(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch (_) {
      return [value].filter(Boolean);
    }
  }
  return [];
}
```

운영 원칙:

- 글 등록: 업로드 성공 URL을 배열로 저장한다.
- 글 수정: 기존 URL 배열과 새 업로드 URL을 병합한다.
- 사진 삭제 UI: 배열에서 URL만 제거한다.
- Storage 실제 파일 삭제: 별도 작업으로 분리한다.
- 깨진 URL이 저장되지 않도록 `getPublicUrl()` 결과를 확인한다.

## 11. iPhone Safari 사진첨부 참고

iPhone Safari에서는 아래 상황이 발생할 수 있다.

- `file.type`이 빈 문자열일 수 있다.
- HEIC/HEIF 확장자가 들어올 수 있다.
- 큰 사진 파일은 업로드 시간이 길거나 실패할 수 있다.
- 사진 선택 후 브라우저가 파일 preview를 다르게 처리할 수 있다.

프론트 기준 대응:

- MIME type만 보지 않고 파일 확장자도 확인한다.
- `jpg`, `jpeg`, `png`, `webp`, `gif`, `heic`, `heif`를 이미지 후보로 처리한다.
- 10MB 초과 파일은 사용자에게 안내한다.
- 실패 시 `사진 업로드에 실패했습니다.` 또는 `이미지 파일 형식 또는 용량을 확인해주세요.`로 구분한다.

운영 확인 항목:

- iPhone Safari에서 사진 없이 글 등록
- iPhone Safari에서 사진 1장 첨부 후 글 등록
- iPhone Safari에서 게시글 수정 후 사진 추가
- 새로고침 후 이미지 표시 유지

## 12. 실패 메시지와 로그 원칙

사용자에게 보여줄 메시지:

- `로그인 후 글을 등록할 수 있습니다.`
- `글 등록에 실패했습니다.`
- `사진 업로드에 실패했습니다.`
- `글 저장에 실패했습니다.`
- `삭제 권한이 없거나 이미 삭제된 글입니다.`
- `이미지 파일 형식 또는 용량을 확인해주세요.`

콘솔에 남길 수 있는 값:

- 단계명
- `postId`
- 로그인 사용자 존재 여부
- `post.user_id` 존재 여부
- `String(currentUser.id) === String(post.user_id)` 결과
- payload keys
- `image_urls` 개수
- file count
- `error.message`

콘솔에 남기면 안 되는 값:

- access token
- refresh token
- API key
- Supabase service role key
- 전체 user object
- signed URL token
- 파일 binary
- `.env.local` 값

## 13. 점검 체크리스트

Supabase Dashboard에서 확인할 것:

- [ ] `posts` 테이블 RLS enabled
- [ ] `posts_select_all` 또는 동등한 select 정책 존재
- [ ] `posts_insert_own` 또는 동등한 insert 정책 존재
- [ ] `posts_update_own` 또는 동등한 update 정책 존재
- [ ] `posts_delete_own` 또는 동등한 delete 정책 존재
- [ ] `post-images` Storage bucket 존재
- [ ] `post-images` upload 정책 존재
- [ ] `post-images` read 정책 존재
- [ ] 프론트 upload path 첫 폴더가 `auth.uid()`와 일치
- [ ] 이미지 public URL이 실제 브라우저에서 열림

브라우저에서 확인할 것:

- [ ] 로그인 후 사진 없이 글 등록
- [ ] 로그인 후 사진첨부 글 등록
- [ ] 내가 쓴 글 수정
- [ ] 내가 쓴 글 사진 추가 후 수정 저장
- [ ] 내가 쓴 글 삭제
- [ ] 남의 글 수정/삭제 버튼 미노출 또는 실행 차단
- [ ] iPhone Safari 사진첨부 등록
- [ ] 실패 시 단계별 사용자 메시지 표시

## 14. 보안 주의사항

- `service_role` key는 프론트 코드, HTML, JSON, 문서에 넣지 않는다.
- API key, secret, `.env.local` 값은 저장소에 넣지 않는다.
- Storage 정책 문제를 service role 업로드로 우회하지 않는다.
- 사용자 이미지 삭제 정책은 별도로 설계한다.
- 공개 bucket을 사용할 경우 이미지 URL은 누구나 접근 가능하다는 점을 사용자 안내/운영 정책에서 고려한다.


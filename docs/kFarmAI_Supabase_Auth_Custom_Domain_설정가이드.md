# kFarmAI Supabase Auth Custom Domain 설정 가이드

## 1. 목적

Google 로그인과 이메일 OTP 로그인 과정에서 사용자에게 Supabase 기본 도메인 대신 `auth.kfarmai.com` 형태의 인증 도메인이 보이도록 준비합니다.

목표는 인증 과정에서도 kFarmAI 브랜드 신뢰도를 유지하는 것입니다.

현재 Google 계정 선택 화면에서 보이는 `xzetqjie...supabase.co` 문구는 kFarmAI 코드의 `redirectTo` 주소가 아니라 Supabase Auth 제공 도메인입니다. Google OAuth는 Supabase Auth를 통해 시작되므로, Custom Domain 설정 전에는 Google 화면에서 Supabase 기본 도메인이 표시될 수 있습니다.

중요 원칙:

- 코드의 `redirectTo`만 바꿔서는 Google 계정 선택 화면의 `supabase.co` 문구를 완전히 숨길 수 없습니다.
- 이 문구를 숨기려면 Supabase Auth Custom Domain을 `auth.kfarmai.com`으로 설정해야 합니다.
- Custom Domain 적용 후 Google Cloud Console OAuth 설정도 Supabase가 안내하는 값 기준으로 갱신해야 합니다.

## 2. 희망 구조

- 서비스 도메인: `https://kfarmai.com`
- 인증 도메인: `https://auth.kfarmai.com`
- 콜백 페이지: `https://kfarmai.com/auth-callback.html`

## 3. Supabase Dashboard 확인 위치

Supabase Dashboard에서 아래 항목을 확인해야 합니다.

- Project Settings 또는 Auth 설정의 Custom Domain / Auth Custom Domain 지원 여부
- `auth.kfarmai.com` 등록 가능 여부
- 현재 사용 중인 Supabase 플랜에서 Auth Custom Domain을 지원하는지 여부
- Custom Domain 적용 후 Supabase가 표시하는 Google OAuth callback URL

이 값은 프로젝트와 플랜에 따라 다를 수 있으므로 코드에서 임의로 처리하지 않습니다.

## 4. DNS 설정 필요

kfarmai.com DNS 관리 화면에서 `auth` 서브도메인을 추가해야 합니다.

원칙:

- Supabase가 안내하는 CNAME/TXT 레코드를 그대로 등록합니다.
- 임의 값을 만들지 않습니다.
- Supabase 화면에 표시되는 값을 그대로 사용합니다.
- DNS 반영 후 Supabase Dashboard에서 검증 완료 상태를 확인합니다.

## 5. Authentication > URL Configuration 설정값

Supabase Dashboard의 Authentication URL 설정에서 아래 값을 확인합니다.

Site URL:

```text
https://kfarmai.com
```

Redirect URLs:

```text
https://kfarmai.com/**
https://www.kfarmai.com/**
https://kfarmai.com/auth-callback.html
https://www.kfarmai.com/auth-callback.html
```

개발 테스트가 필요하면 로컬 URL은 별도로 추가할 수 있지만, 운영 배포 기준에서는 Supabase 기본 도메인이나 localhost로 돌아가면 안 됩니다.

## 6. Google Cloud OAuth 설정값

Google Cloud Console의 OAuth 클라이언트 설정에서 아래 항목을 확인합니다.

Authorized domains:

```text
kfarmai.com
```

Authorized JavaScript origins:

```text
https://kfarmai.com
https://www.kfarmai.com
https://auth.kfarmai.com
```

Authorized redirect URIs:

```text
Supabase가 제공하는 Google OAuth callback URL을 정확히 사용합니다.
```

주의:

- callback URL을 임의로 추측해서 넣지 않습니다.
- Custom Domain 적용 후 Supabase 화면에서 callback URL이 `auth.kfarmai.com` 기반으로 바뀌는지 확인합니다.
- 바뀐 경우 Google Cloud Console의 Authorized redirect URIs도 Supabase가 표시한 값으로 갱신합니다.
- Google 계정 선택 화면의 앱/도메인 표시는 Google OAuth 앱 설정과 Supabase Auth 도메인 설정의 영향을 함께 받습니다.

## 7. 주의사항

- Supabase 기본 Auth를 쓰는 한 Custom Domain 설정 전에는 `xxxxx.supabase.co`가 인증 과정에서 잠깐 보일 수 있습니다.
- 완전히 보이지 않게 하려면 Supabase Auth Custom Domain 설정이 필요합니다.
- 코드 수정만으로 Google 계정 선택 화면의 `supabase.co` 문구를 완전히 제거할 수 없습니다.
- 플랜 제한이 있을 수 있으므로 Dashboard에서 지원 여부를 먼저 확인해야 합니다.
- 코드에 service role key, secret, `.env.local` 값을 넣지 않습니다.
- 설정 전후 Google 로그인, 이메일 OTP 로그인, 로그아웃, 세션 유지 테스트가 필요합니다.

## 8. 테스트 체크리스트

- Google 로그인 클릭 후 최종 콜백이 `https://kfarmai.com/auth-callback.html`로 돌아오는지 확인
- 이메일 OTP 발송 후 메일에 표시된 인증번호로 로그인이 되는지 확인
- 로그인 후 MY 패널이 로그인 상태로 표시되는지 확인
- 로그아웃 후 세션이 유지되지 않는지 확인
- Custom Domain 적용 후 인증 과정에서 `auth.kfarmai.com`이 사용되는지 확인

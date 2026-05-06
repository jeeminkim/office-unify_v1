# Google 로그인 + Supabase Auth (persona-chat)

1인 전용 내부 서비스 기준으로, **허용 이메일은 단일 계정(`<allowed-email>`)** 정책이며, 서버·클라이언트 모두에서 이 정책을 따른다.
현재 구현 예시는 특정 단일 계정 상수 기반이며, 문서에서는 실이메일 반복 기재를 지양한다.

## 역할 분리

| 변수 | 용도 |
|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | 브라우저·SSR 공통 Supabase 프로젝트 URL (공개 가능) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `@supabase/ssr` 세션 쿠키·Auth (브라우저에 포함되지만 RLS·anon 권한만) |
| `SUPABASE_SERVICE_ROLE_KEY` | **서버 Route Handler 전용** — 기존 `getServiceSupabase()` DB 접근 |
| `GEMINI_API_KEY` | 서버 전용 LLM 호출 |

`SUPABASE_SERVICE_ROLE_KEY`와 `GEMINI_API_KEY`에는 **`NEXT_PUBLIC_`를 붙이지 않는다.**

## 로컬 vs Vercel

- **로컬**: `apps/web/.env.local`에 위 변수 설정 후 `npm run dev`.
- **Vercel**: 프로젝트 Settings → Environment Variables에 동일 키를 Production/Preview에 복사.  
  `NEXT_PUBLIC_*`는 빌드 시 주입되므로 배포 후 재빌드가 필요할 수 있다.

## Supabase SQL (persona chat 멱등)

- POST `/api/persona-chat/message`는 **`web_persona_chat_requests` 테이블**을 사용한다. Supabase SQL Editor에서 `docs/sql/append_web_persona_chat_requests.sql`을 적용한다. 미적용 시 API가 503과 안내 메시지를 반환한다.

## 향후 확장 포인트

- 허용 사용자가 여러 명이 되면 `ALLOWED_APP_EMAILS` 또는 DB 매핑 테이블(예: `app_users`)을 두고, `auth.users.id` ↔ `OfficeUserKey`를 조회하는 방식으로 확장할 수 있다. 이번 단계에서는 **테이블을 도입하지 않았다.**

---

## 수동 설정 체크리스트

### Google Cloud Console

- [ ] OAuth 동의 화면(테스트 사용자에 본인 Gmail 포함, 또는 프로덕션 앱 승인).
- [ ] OAuth 2.0 클라이언트 ID 유형: **웹 애플리케이션**.
- [ ] **승인된 리디렉션 URI**에 Supabase가 제공하는 URL 추가 (아래 Supabase 대시보드에서 복사).

### Supabase Dashboard → Authentication → Providers → Google

- [ ] Google 로그인 활성화.
- [ ] Client ID / Client Secret을 Google Cloud에서 발급한 값으로 입력.
- [ ] **Redirect URLs** (Site URL / 추가 URL):
  - 로컬: `http://localhost:3000/auth/callback` (또는 사용 중인 포트).
  - 프로덕션: `https://<your-domain>/auth/callback`.
- [ ] Authentication → URL configuration: **Site URL**을 배포 도메인(또는 로컬)으로 맞춤.

### Vercel (배포 시)

- [ ] `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY` 설정.
- [ ] Google OAuth 리디렉션 URI에 **프로덕션** `https://.../auth/callback` 등록.
- [ ] Supabase Redirect URLs에 Vercel 도메인 허용.

### 앱 정책

- [ ] 허용 계정은 **`kingjeemin@gmail.com` 오타 없이** (`@gmail.co` 아님).

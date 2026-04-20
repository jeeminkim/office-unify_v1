# Office Unify

Next.js 기반 모노레포입니다. **Dev Assistant(생성/요약)**, **Research/Infographic 생성**, **Supabase 연동**(페르소나 채팅, 포트폴리오 원장, 투자위원회 등), **Google 로그인**을 사용합니다.

**대표 화면(참고):** `/persona-chat`, `/portfolio-ledger`, `/research-center`, `/infographic`, `/trend`(트렌드 분석 센터), `/committee-discussion`, `/committee-followups` 등 — 구현·계약은 `docs/` 및 `packages/ai-office-engine` 주석을 우선합니다.

| 경로 | 설명 |
|------|------|
| `apps/web` | Next.js 16 App Router · 메인 웹 앱 |
| `packages/shared-types` | 공용 DTO·타입 |
| `packages/shared-utils` | KST 날짜 등 유틸 |
| `packages/supabase-access` | Supabase 접근 레이어 |
| `packages/ai-office-engine` | LLM 오케스트레이션·페르소나 프롬프트 |
| `docs/` | 운영·SQL·인증 가이드 |
| `prompts/` | Cursor/GPT용 프롬프트(선택) |

---

## 최근 기능 업데이트 (MVP)

### 산업 인포그래픽 생성기 (`/infographic`)

- 목적: 블로그 글/증권사 리포트/붙여넣은 원문을 1페이지 산업 인포그래픽으로 생성
- 파이프라인: `원문 -> 구조화 JSON(InfographicSpec) -> 고정 SVG 템플릿 렌더 -> PNG 저장`
- 원칙:
  - 생성형 이미지 모델에 텍스트 렌더링을 맡기지 않음
  - 4개 산업 zone 고정 템플릿으로 재현성 확보
  - 수치 부족 시 추정 금지(`null`/빈 배열/`unknown` + warnings)
  - 1차 MVP는 DB 비저장(무상태 미리보기/내보내기)
- API: `POST /api/infographic/extract`
- 상세 문서: `docs/INFOGRAPHIC_GENERATOR.md`

### 위원회 후속작업 운영/재분석

- `/committee-followups` 운영 보드(조회/필터/상태 전이/PATCH) + 재분석 실행/아티팩트 누적 저장
- API: `followups/:id/reanalyze`, `followups/:id/artifacts` 등
- 자동 투자 실행 금지 원칙 유지

---

## 요구 사항

- **Node.js** 20+ 권장  
- **npm** (workspace 사용)

---

## 로컬 실행

저장소 루트에서:

```bash
npm install
npm run dev
```

개발 서버: [http://localhost:3000](http://localhost:3000) (`apps/web`)

기타 스크립트:

| 명령 | 설명 |
|------|------|
| `npm run build` | 프로덕션 빌드 (`apps/web`) |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript 검사 |
| `npm run selfcheck` | 웹 앱 셀프체크 |

`apps/web` 단독으로는 워크스페이스 패키지(`@office-unify/*`)가 없어 **반드시 루트에서** 설치·빌드합니다.

---

## 환경 변수 (`apps/web/.env.local`)

Git에 커밋하지 않습니다. `.gitignore`에 `.env*`, `.env.local` 등이 포함되어 있습니다.

### 필수(대부분의 기능)

| 변수 | 공개 | 설명 |
|------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | 예 | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 예(anon) | 브라우저·미들웨어·서버 컴포넌트에서 Auth 세션 |
| `SUPABASE_URL` | 아니오 | 서버 Route Handler에서 DB 접근 시(보통 `NEXT_PUBLIC_SUPABASE_URL`과 동일 값) |
| `SUPABASE_SERVICE_ROLE_KEY` | 아니오 | 서버 전용 · RLS 우회·원장/멱등 등 쓰기 |
| `GEMINI_API_KEY` | 아니오 | `/api/generate`, persona-chat, 위원회 등 Gemini 호출 |

### OpenAI를 쓰는 기능에 필요

| 변수 | 설명 |
|------|------|
| `OPENAI_API_KEY` | Private Banker, 일부 OpenAI 라우팅 페르소나(`hindenburg`, `jim-simons`, `jo-il-hyeon` 등), 위원회 토론에서 OpenAI 경로 |

### 선택

| 변수 | 설명 |
|------|------|
| `OFFICE_UNIFY_PORTFOLIO_READ_SECRET` | `GET /api/portfolio/accounts`, `GET /api/portfolio/summary` 등 **Bearer** 보호용. 미설정 시 해당 API 비활성 안내 |
| `OFFICE_UNIFY_GEMINI_PERSONA_CHAT_MODEL` 등 | `packages/ai-office-engine/src/llmEnvConfig.ts` 참고 |

**원칙:** `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`에는 **`NEXT_PUBLIC_`를 붙이지 않습니다.**

---

## Vercel 배포

### 1) GitHub 연동

1. 이 저장소를 GitHub에 푸시합니다.  
2. [Vercel](https://vercel.com) → **Add New** → **Project** → GitHub 저장소 선택.

### 2) 프로젝트 루트

- **Root Directory**: `apps/web`  
- `apps/web/vercel.json`에 따라 **설치/빌드는 저장소 루트**에서 실행됩니다 (`cd ../.. && npm install`, `npm run build --workspace=apps/web`).

### 3) 환경 변수

Vercel → Project → **Settings** → **Environment Variables**에 위 표와 동일한 키를 **Production** (필요 시 Preview/Development)에 넣습니다.

- `NEXT_PUBLIC_*` 변경 후에는 **재배포**가 필요할 수 있습니다.  
- 서버 전용 키는 **브라우저에 노출되지 않게** 유지합니다.

### 4) 빌드 확인

로컬에서 `npm run build`가 통과하는지 먼저 확인하는 것을 권장합니다.

---

## Supabase

### 프로젝트

1. [Supabase](https://supabase.com)에서 프로젝트 생성.  
2. **Settings → API**에서 `URL`, `anon` `public` 키, `service_role` 키를 복사해 환경 변수에 반영합니다.

### SQL (기능별)

Supabase **SQL Editor**에서 필요한 스크립트를 순서에 맞게 적용합니다. 자세한 내용은 각 파일 주석과 `docs/`를 참고하세요.

| 기능 | 참고 파일 |
|------|-----------|
| 페르소나 채팅(세션·메시지) | `docs/sql/append_web_persona_chat_phase1.sql` 등 |
| 멱등 요청(`web_persona_chat_requests`) | `docs/sql/append_web_persona_chat_requests.sql` |
| 월간 OpenAI 사용량(선택) | `docs/sql/append_web_llm_usage_monthly.sql` |
| 포트폴리오 원장 | `docs/sql/append_web_portfolio_ledger.sql` |
| Dev Support 피드백 등 | `docs/sql/append_web_dev_support.sql` |
| 원장 `user_key` 수정 | `docs/sql/fix_web_portfolio_user_key_from_placeholder.sql` |
| Trend Analysis Center — SQL memory(선택) | `docs/sql/append_web_trend_memory_phase1.sql` — 미적용 시 `/trend` 리포트는 동작하고 memory 레이어만 생략 |

미적용 시 일부 API는 503과 안내 메시지를 반환할 수 있습니다.

### Auth ↔ 앱

- **Authentication → Providers → Google**: Google Client ID/Secret 연결.  
- **Authentication → URL Configuration**  
  - **Site URL**: 프로덕션 `https://<vercel-domain>` 또는 로컬 `http://localhost:3000`  
  - **Redirect URLs**: `https://<vercel-domain>/auth/callback`, `http://localhost:3000/auth/callback` 등  

자세한 체크리스트: `docs/auth-google-supabase.md`

---

## Google Cloud (OAuth)

1. [Google Cloud Console](https://console.cloud.google.com/)에서 프로젝트 선택.  
2. **APIs & Services → OAuth consent screen** (테스트 사용자에 본인 이메일 등록).  
3. **Credentials → OAuth 2.0 Client IDs → 웹 애플리케이션**  
4. **승인된 리디렉션 URI**에 Supabase가 안내하는 URL을 넣습니다.  
   - Supabase 대시보드 **Authentication → Providers → Google**에 표시되는 Redirect URL을 그대로 복사하는 방식이 안전합니다.

환경 변수 원칙: `docs/env-operating-principles.md`

---

## GitHub에서 할 일 (요약)

| 단계 | 할 일 |
|------|--------|
| 저장소 | 코드 푸시·브랜치 전략(예: `main` 보호)은 팀 정책에 맞게 설정 |
| Vercel | 저장소 연결, Root Directory `apps/web`, 환경 변수 입력, 배포 |
| Supabase | 프로젝트 생성, SQL 적용, Google Provider·Redirect URL 설정 |
| Google | OAuth 클라이언트·리디렉션 URI를 Supabase와 동일하게 맞춤 |

---

## 앱 접근 정책 (참고)

로그인 허용 이메일은 코드 상 **`kingjeemin@gmail.com`** 한 계정으로 제한되어 있습니다 (`apps/web/lib/server/allowed-user.ts`).  
다른 계정을 허용하려면 해당 상수·로직을 변경해야 합니다.

---

## 문서

- `docs/auth-google-supabase.md` — Google + Supabase + Vercel 체크리스트  
- `docs/env-operating-principles.md` — 환경 변수 규칙  
- `docs/trend-analysis-center.md` — `/trend` API·도구·SQL memory 요약  
- `docs/INFOGRAPHIC_GENERATOR.md` — `/infographic` JSON 스키마·렌더·PNG 저장 가이드  
- `docs/DATABASE_SCHEMA.md` — 웹 DDL 요약(트렌드 memory 등)  
- `apps/web/README.md` — Dev Assistant 화면 중심 설명  

---

## 라이선스

Private / 내부 사용 전제(저장소 설정에 따름).

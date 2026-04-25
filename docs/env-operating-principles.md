# 환경 변수 운영 원칙 (apps/web)

## 위치

- 로컬: `apps/web/.env.local` (Git에 커밋하지 않음)
- 배포: 호스팅(Vercel 등) 비밀 저장소에 동일 키 설정

## 규칙

1. **서버 전용 비밀**(`SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `OFFICE_UNIFY_*` 등)에는 **`NEXT_PUBLIC_` 접두사를 붙이지 않는다.** 브라우저 번들에 포함되면 안 된다.
2. 클라이언트에 필요한 공개 값만 `NEXT_PUBLIC_`를 사용한다. Supabase Auth는 **`NEXT_PUBLIC_SUPABASE_URL`** + **`NEXT_PUBLIC_SUPABASE_ANON_KEY`**(anon, 공개 키)로 세션을 맞추고, **DB에 대한 민감한 쓰기는 서버에서만 `SUPABASE_SERVICE_ROLE_KEY`로 수행**한다.
3. 예시 파일이 필요하면 `.env.example`에 **키 이름만** 두고 값은 비우거나 placeholder만 사용한다.
4. 저장소에는 실제 토큰·키 문자열을 넣지 않는다.

## persona chat 관련 (참고)

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase Auth 세션(쿠키), persona chat API 라우트에서 사용자 식별
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`: 서버 전용 Supabase(DB; 기존 repository + `web_persona_chat_requests` 멱등 테이블)
- `GEMINI_API_KEY`: 서버에서만 Gemini 호출 — **Dev_Support** (`/api/generate`)와 **persona-chat** 공통. 브라우저·`NEXT_PUBLIC_`로 노출하지 않는다.
- `OPENAI_API_KEY`: 서버에서만 OpenAI 호출 (**Private Banker / J. Pierpont** 전용)
- `OFFICE_UNIFY_PORTFOLIO_READ_SECRET` 등: 포트폴리오 등 **다른 API**용 Bearer(선택)

## 시스템 상태판 (`/system-status`)

개인용 투자 콘솔은 `/api/system/status`로 아래 항목의 존재/접근 가능 여부를 진단한다.

- Env 존재 여부:
  - `SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `OPENAI_API_KEY`
  - `GEMINI_API_KEY`
  - `GOOGLE_SERVICE_ACCOUNT_JSON`
  - `GOOGLE_SHEETS_SPREADSHEET_ID`
  - `OFFICE_UNIFY_PORTFOLIO_READ_SECRET`
- 단일 사용자 게이트:
  - `allowed-user.ts`의 허용 계정 상수 체크
- DB 테이블 접근:
  - `web_portfolio_holdings`
  - `web_persona_chat_requests`
  - `trend_memory_topics`
  - `trade_journal_entries`

응답은 값 자체를 반환하지 않고 상태(`ok|warn|error|not_configured`)만 노출한다.

## 포트폴리오 시세/환율 조회 (서버 런타임)

- `/api/portfolio/summary`는 Google Sheets `GOOGLEFINANCE` 수식 결과 read-back을 1순위 provider로 사용한다.
- Google Finance 직접 API 호출은 사용하지 않는다.
- Sheets read-back 실패 시 Yahoo quote(`KRW=X` 포함)를 fallback provider로 사용한다.
- Sheets 계산 직후에는 값이 비어 있을 수 있어 지연(delayed) 상태를 표시한다.
- refresh 응답 후 즉시 재조회하지 말고 30~90초 후 `/api/portfolio/quotes/status`로 row 상태를 점검한다.
- status API는 `googleTicker/rawPrice/parsedPrice/rowStatus`를 제공해 ticker mismatch/parse failure를 분리 진단한다.
- 시세/환율 실패 시 임의 가격을 생성하지 않는다.
- 시세 실패는 손실과 다르므로 손익률을 -100% 같은 값으로 계산하지 않고 NO_DATA로 처리한다.

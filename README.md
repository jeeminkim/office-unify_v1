# Office Unify

`office-unify_v1`는 Next.js + TypeScript + Supabase + ai-office-engine 기반 모노레포입니다.  
처음 접하는 분이 **로컬 실행부터 주요 기능 확인까지** 빠르게 따라올 수 있도록 정리했습니다.

---

## 이 프로젝트가 하는 일

- 투자/리서치 지원 웹앱 (`apps/web`)
- 위원회 토론 + 후속작업 운영 보드 + 재분석 루프
- 산업 인포그래픽 생성(텍스트/URL/PDF 입력 → 구조화 → 렌더 → PNG 저장)
- Supabase 인증/DB 연동, Google OAuth 로그인

중요 원칙:
- 자동 매매/자동 주문/자동 원장 수정 **금지**
- 결과 생성과 실행 책임을 분리해 운영 안정성을 높임

---

## 빠른 시작 (5분)

### 1) 요구 사항

- Node.js 20+
- npm (workspace)

### 2) 설치 및 실행

저장소 루트에서 실행:

```bash
npm install
npm run dev
```

- 웹앱: `http://localhost:3000`
- 워크스페이스 구조 때문에 **항상 루트에서 실행**해야 합니다.

### 3) 자주 쓰는 명령

| 명령 | 설명 |
|------|------|
| `npm run typecheck` | 타입 검사 |
| `npm run lint` | ESLint 검사 |
| `npm run build` | 프로덕션 빌드 |
| `npm run selfcheck` | 웹앱 셀프 체크 |

---

## 필수 환경 변수 (`apps/web/.env.local`)

아래 값이 없으면 주요 API가 동작하지 않습니다.

| 변수 | 설명 |
|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_URL` | 서버 DB 접근 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 전용 키 |
| `GEMINI_API_KEY` | Gemini 호출 키 |
| `OPENAI_API_KEY` | OpenAI 경로 사용 시 필요 |

보안 원칙:
- `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`는 절대 `NEXT_PUBLIC_`를 붙이지 않습니다.
- `.env.local`은 Git에 커밋하지 않습니다.

---

## 폴더 구조 한눈에 보기

| 경로 | 역할 |
|------|------|
| `apps/web` | Next.js App Router 메인 앱 |
| `packages/shared-types` | 공용 타입/DTO |
| `packages/shared-utils` | 공용 유틸 |
| `packages/supabase-access` | Supabase 접근 레이어 |
| `packages/ai-office-engine` | LLM 오케스트레이션/추출 로직 |
| `docs/` | 운영/SQL/기능 문서 |

---

## 주요 기능 (처음 확인할 화면)

### 1) 위원회 토론/후속작업

- `/committee-discussion`: 토론, 조일현 보고서 생성, 후속작업 초안 추출
- `/committee-followups`: 저장된 후속작업 운영 보드(검색/필터/상태전이/재분석)

최근 안정화 포인트:
- followup 경고에 item-aware 가이드 + 품질 요약 strip
- 조일현 sanitizer traceability + sanitation severity 표시

### 2) 인포그래픽 생성

- `/infographic`
- 입력: `text`, `url`, `pdf_upload`, `pdf_url`
- 흐름: `원문 추출 -> cleanup -> preview/edit -> spec 생성 -> 렌더 -> PNG 저장`

최근 안정화 포인트:
- cleanup 품질 요약(strip) + raw/cleaned 길이 비교
- 모바일에서 저장용 미리보기 후 PNG 저장(confirm 포함)

---

## Supabase 설정 요약

1. Supabase 프로젝트 생성  
2. API 키를 `.env.local`에 반영  
3. 필요한 SQL을 `docs/sql/*.sql`에서 적용  
4. Google Provider + Redirect URL 설정

세부 체크리스트:
- `docs/auth-google-supabase.md`
- `docs/DATABASE_SCHEMA.md`

---

## 배포 요약 (Vercel)

- GitHub 저장소 연결
- Vercel Root Directory: `apps/web`
- 환경 변수 등록 후 배포
- 배포 전 로컬에서 `npm run build` 통과 확인 권장

---

## 트러블슈팅

- **빌드 실패(패키지 못 찾음)**: `apps/web` 안이 아니라 루트에서 명령 실행했는지 확인
- **API 503**: Supabase 키/필수 SQL 미적용 여부 확인
- **로그인 실패**: Supabase Google Provider와 Redirect URL 설정 확인
- **LLM 호출 실패**: `GEMINI_API_KEY` / `OPENAI_API_KEY` 확인

---

## 참고 문서

- `apps/web/README.md` (웹앱 기능 중심 상세)
- `docs/committee-discussion.md`
- `docs/INFOGRAPHIC_GENERATOR.md`
- `docs/CHANGELOG.md`
- `docs/env-operating-principles.md`
- `docs/trend-analysis-center.md`

---

## 라이선스

Private repository (내부 사용 전제).

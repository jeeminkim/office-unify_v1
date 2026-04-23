# Office Unify v1

`office-unify_v1`는 **투자/리서치 지원 웹앱**을 중심으로 구성된 모노레포입니다.  
기술 스택은 Next.js App Router + TypeScript + Supabase + `ai-office-engine`이며, 기능 확장보다 **실사용 안정성**을 우선합니다.

## 핵심 목표

- 토론/분석/정리/회고 흐름을 하나의 웹앱에서 제공
- LLM 결과를 그대로 노출하지 않고, 후처리/검증/복구를 포함한 운영 친화 구조 유지
- 자동 실행 기능(자동 매매/자동 주문/자동 원장 수정) 없이 의사결정 보조에 집중

## 제품 원칙

- 자동 매매 / 자동 주문 / 자동 원장 수정 **금지**
- checklist(원칙 점검)가 1차 기준, PB/페르소나는 2차 검토자
- report(사람용 문서)와 extractor(JSON 작업 초안) 책임 분리
- additive 변경 우선(기존 기능 충돌 최소화)

---

## 빠른 시작

### 1) 요구 사항

- Node.js 20+
- npm (workspaces 사용)

### 2) 설치

저장소 루트에서 실행:

```bash
npm install
```

### 3) 환경 변수

`apps/web/.env.local`에 아래 값을 설정:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `OPENAI_API_KEY`

보안 주의:

- `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`는 `NEXT_PUBLIC_`로 노출 금지
- `.env.local`은 절대 커밋 금지

### 4) 실행

```bash
npm run dev
```

- 기본 주소: `http://localhost:3000`
- 워크스페이스 구조이므로 명령은 **루트에서 실행**하는 것이 안전합니다.

### 5) 품질 점검 명령

```bash
npm run typecheck
npm run lint
npm run build
npm run selfcheck
```

---

## 모노레포 구조

- `apps/web`: 메인 Next.js 앱
- `packages/ai-office-engine`: 프롬프트/추출/리뷰 오케스트레이션
- `packages/supabase-access`: DB 접근 레이어(repository)
- `packages/shared-types`: 공용 타입/DTO
- `packages/shared-utils`: 공용 유틸
- `docs`: SQL/기능/운영 문서

---

## 주요 기능 지도

### 1) Trade Journal (원칙 기반 매매일지)

- 경로: `/trade-journal`, `/trade-journal/analytics`
- 역할:
  - 원칙 세트 관리
  - 거래 입력 + 자동 checklist 평가
  - PB/페르소나 2차 검토
  - 회고/누적 분석
- 최근 품질 보강:
  - 구조화 규칙 실행(`rule_key`, `target_metric`, `operator`)
  - 매수/매도 유형(`entry_type`, `exit_type`) + `conviction_level`
  - review snapshot 저장
  - `evidence_json` 기반 판정 근거 저장
  - sell 전용 지표(details) 확장

### 2) Committee Discussion / Followups

- `/committee-discussion`: 토론, 보고서 생성, 후속작업 초안 추출
- `/committee-followups`: 후속작업 운영 보드(필터/상태 전이/재분석)
- 안정화 특징:
  - JSON 파싱 복구 파이프라인(엄격 파싱 + repair + fallback)
  - 사용자용 자연어 경고 및 권장 행동 가이드
  - 보고서/추출 책임 분리 유지

### 3) Infographic Generator

- `/infographic`
- 입력: `text`, `url`, `pdf_upload`, `pdf_url`
- 파이프라인:
  - source extract -> cleanup -> preview/edit -> spec 생성 -> 렌더 -> PNG 저장
- 안정화 특징:
  - 모바일 reader-first (읽기 우선, export 후순위)
  - degraded fallback 가이드
  - article-aware / opinion-aware 경로

### 4) Dev Assistant

- `/`에서 Flow/Mermaid, SQL, TypeScript 생성 보조
- Mermaid는 extract/sanitize/validate/fallback 파이프라인으로 운영

---

## 데이터베이스 적용

1. Supabase 프로젝트 준비
2. `docs/sql/*.sql` 파일을 필요한 순서로 적용
3. 스키마 참조:
   - `docs/DATABASE_SCHEMA.md`
   - `docs/sql/append_web_trade_journal.sql`
   - `docs/sql/append_web_committee_followups.sql`

주의:

- SQL은 idempotent/additive 기준으로 관리합니다.
- 운영 환경에서는 인덱스/제약 적용 순서와 락 영향 확인이 필요합니다.

---

## 배포 요약 (Vercel)

- Repository 연결
- Root Directory: `apps/web`
- 환경 변수 등록
- 배포 전 `npm run build` 통과 확인 권장

---

## 트러블슈팅

- 패키지/모듈 오류: 루트에서 `npm install` 재실행
- API 503: Supabase 환경변수 누락 또는 SQL 미적용 가능성 확인
- 로그인 실패: Supabase Auth provider + redirect URL 확인
- LLM 실패: `GEMINI_API_KEY`/`OPENAI_API_KEY` 값 및 제한 확인
- Windows 권한 오류:
  - `apps/web`에서 `npm run clean:win` 실행 후 재설치/재실행

---

## 문서 인덱스

- `apps/web/README.md`: 웹앱 상세 동작
- `docs/CHANGELOG.md`: 변경 이력
- `docs/DATABASE_SCHEMA.md`: 스키마 개요
- `docs/trade-journal.md`: 매매일지 설계/검증
- `docs/committee-discussion.md`: 위원회 기능
- `docs/INFOGRAPHIC_GENERATOR.md`: 인포그래픽 파이프라인
- `docs/trend-analysis-center.md`: 트렌드 분석 센터
- `docs/overview/project-vision.md`: 프로젝트 상위 비전

---

## 라이선스

Private repository (내부 사용 전제)

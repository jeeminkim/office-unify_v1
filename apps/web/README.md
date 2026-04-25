# `apps/web` — Office Unify 웹 앱

Next.js(App Router) + TypeScript + Tailwind입니다. **저장소 루트(`../..`)의 `README.md`**에 모노레포 구조·배포·Supabase·환경 변수 전체가 정리되어 있습니다.

## 이 폴더에서 하는 일

- **투자 대시보드** (`/`): 시스템 상태, 포트폴리오 요약, 일일 루틴, Trend 기억 요약, 신호 연결.
- **포트폴리오 현황 대시보드** (`/portfolio`): 보유 평가/손익/비중/경고 점검 화면.
- **포트폴리오 원장 관리** (`/portfolio-ledger`): 보유 종목 수정/삭제/사후 매수·매도 기록 반영(주문 실행 아님).
- **실현손익 대시보드** (`/realized-pnl`): 기간/종목/최근 매도 이벤트 기준 실현손익 추적.
- **목표 자금 관리** (`/financial-goals`): 목표 생성, 실현손익 연결, 목표 달성률 추적.
- **Dev Assistant** (`/dev-assistant`): Flow/ Mermaid, SQL, TypeScript 생성 — Gemini는 UI 설정 또는 서버 `GEMINI_API_KEY` 사용.
- **Persona chat**, **Private Banker**, **투자위원회**, **포트폴리오 원장** 등: Supabase + 서버 API 라우트.
- **Infographic Generator** (`/infographic`): 원문 -> 구조화 JSON -> 고정 템플릿 SVG 인포그래픽 렌더 + PNG 저장.

## 로컬 실행

저장소 **루트**에서:

```bash
cd ../..
npm install
npm run dev
```

`apps/web`만 열어 `npm install` 하면 workspace 패키지가 없어 실패합니다.

## 환경 변수

`apps/web/.env.local` (Git 무시). 키 목록은 **루트 `README.md`** 참고.

## Windows 트러블슈팅

```powershell
npm run clean:win   # apps/web 전용 — .next / node_modules 정리
```

- `EPERM` / `ENOTEMPTY`: 프로세스 종료 후 `clean:win` → `npm install` 재시도
- `ERR_SSL_CIPHER_OPERATION_FAILED`: 프록시/네트워크·registry 확인

## localStorage (Dev Assistant)

- `dev_assistant_settings`: API Key 등(설정 모달)
- 기타 초안·최근 결과·피드백 키 — 상세는 기존 주석/코드 참고

민감 정보는 공용 PC에서 사용 후 설정에서 초기화를 권장합니다.

## Infographic Generator (MVP)

경로: `/infographic`

- 입력: `industryName` + `sourceType(text|url|pdf_upload|pdf_url)`
- API: `POST /api/infographic/extract`
- 파이프라인:
  1. sourceType별 본문 추출(text/url/pdf)
  2. LLM이 구조화 JSON(`InfographicSpec`) 생성
  3. 서버 normalize/validate로 누락 필드 및 4개 zone 강제 보정
  4. 클라이언트 `responsive` 읽기 뷰 / `export` A4 저장 뷰 분리
  5. PNG 저장(`export` 기준)

원칙:

- DB 저장 없음 (무상태 MVP)
- 차트 수치 추정 생성 금지 (`null/empty` 허용)
- 투자 조언이 아닌 산업 구조화 도구로 동작
- PDF는 텍스트 레이어 중심 파싱(OCR 미지원)
- **Export(PNG) 전용**: `articlePattern`/`resultMode`에 따라 저장 템플릿이 `IndustryStructureExport` vs `MarketOpinionExport`로 갈린다. 읽기용 responsive는 상세 유지, export는 compact·차트 자동 축약·PNG 경고 최소화.
- 회귀: `K_ENTERTAINMENT_MARKET_REGRESSION_TEXT` / `K_ENTERTAINMENT_MARKET_REGRESSION_SPEC`(시황형·수치 카드)은 `lib/infographic/regressionFixtures.ts`와 `exportLayout.test.ts`에 고정.

## Mermaid 렌더 안정화 파이프라인 (Flow)

Flow 결과는 프롬프트 지시만 신뢰하지 않고 앱에서 아래 방어 단계를 거칩니다.

1. `extractMermaid(raw, jsonField)`
   - JSON `mermaidCode`, markdown mermaid fence, 본문 내 `flowchart|graph|...` 선언 시작점을 순서대로 탐색합니다.
2. `sanitizeMermaid(extracted)`
   - 코드펜스/불필요 설명문 제거, 선언 누락 시 `flowchart TD` 보정, 라벨 위험 문자 정리, 빈/깨진 라인 정리.
3. `validateMermaid(sanitized)`
   - 렌더 전 `mermaid.parse(...)` 사전 검증.
4. `render or fallback`
   - 검증 실패 시 사용자 화면은 폭탄 에러 대신 fallback 카드 + sanitize된 원문을 표시합니다.

### 실패 시 사용자 UX

- 제목: `Flow 이미지를 생성하지 못했습니다`
- 안내 문구: 문법 문제로 이미지 대신 원문 표시
- 원문 펼침(accordion) 제공
- 개발 모드에서는 raw 원문도 확인 가능
- `수정 요청에 붙여넣기용 Mermaid 복사` 버튼으로 재요청 UX 연결

### 운영 로그 포인트

브라우저 콘솔에서 아래 prefix를 확인합니다.

- `MERMAID_EXTRACT_START`
- `MERMAID_EXTRACT_RESULT`
- `MERMAID_SANITIZE_APPLIED`
- `MERMAID_PARSE_OK`
- `MERMAID_PARSE_FAIL`
- `MERMAID_RENDER_OK`
- `MERMAID_RENDER_FAIL`
- `MERMAID_RENDER_FALLBACK`

로그에는 `requestId`, 원문/추출/보정 길이, 추정 타입, parse/render 단계, error(line/column 가능 시)를 남기며 원문 전체는 남기지 않고 truncate된 샘플만 기록합니다.

### 검증용 fixture

`apps/web/lib/mermaid/fixtures.ts`에 아래 8개 수동 검증 케이스를 유지합니다.

- 정상 flowchart
- "다이어그램은 지원되지 않습니다" 같은 비정형 응답
- 자연어 설명 혼합
- 괄호/콜론/세미콜론이 많은 라벨
- 끊긴 화살표
- 선언 누락
- 완전 빈 입력
- SQL/TS/Flow 혼합 장문에서 Mermaid 추출

## Mermaid 2차 안정화 (과보정 방지 + 자동 테스트)

1차 조치 이후 남은 리스크를 줄이기 위해 아래를 추가했습니다.

- `apps/web/lib/mermaid/pipeline.test.ts`로 fixture 기반 자동 테스트 10개 이상을 실행 가능 상태로 승격
- sanitize를 `diagramType` 기준 분기:
  - 공통: 코드펜스 제거, 줄바꿈 정리, smart quote 치환
  - flowchart 전용: 깨진 화살표 제거, 라벨 최소 안전화
  - 비-flowchart(`sequenceDiagram`, `erDiagram`, `classDiagram` 등): 보수적 정제(정상 문법 보존)
- parse 성공/실패와 render 성공/실패 로그를 분리해 운영 추적 가능성 강화
- fallback 영역에 dev 전용 `Mermaid Debug Panel` 추가(raw/extracted/sanitized/parse/render 상태)
- 모바일에서도 원문 박스가 깨지지 않도록 `overflow-x-auto`/`max-w-full` 기반으로 유지

### 모바일 fallback 점검 포인트

- 화면 폭 360px 기준으로 fallback 카드 문구 줄바꿈이 깨지지 않는지
- sanitize 원문 코드 박스가 가로 스크롤로만 넘치고 레이아웃을 밀어내지 않는지
- 실패 상태에서 PNG 버튼 비활성 유지, TXT/MD 저장은 정상 동작하는지

## Committee Followups 운영 보드 (Phase 2)

- 경로: `/committee-followups`
- 역할: 저장된 위원회 후속작업(`committee_followup_items`) 운영/상태 추적
- 제공 기능:
  - 목록 조회 + 필터(status/priority/itemType) + 검색(q) + 정렬(sort)
  - 상세 조회 + artifact 확인
  - 상태 전이 PATCH(서버 검증)
  - 재분석 준비 payload 생성(`/api/committee-discussion/followups/:id/reanalyze-prep`)
  - 실제 재분석 실행(`/api/committee-discussion/followups/:id/reanalyze`) + 결과 artifact 누적 저장

원칙:

- 조일현 Markdown(`report`)은 사람용 문서, 후속작업 운영은 별도 계층
- 자동 주문/자동 매매/원장 자동 반영 금지
- 저장된 항목만 운영 보드에서 관리
- reanalyze는 사용자가 버튼을 눌렀을 때만 실행되며 자동 상태 변경은 하지 않음

## Trade Journal (원칙 기반 매매일지)

- 경로: `/trade-journal`, `/trade-journal/analytics`
- 목적: 자동 매매가 아닌 **원칙 기반 점검 + 페르소나 2차 검토 + 사후 회고**를 하나의 흐름으로 운영
- 핵심 원칙:
  - 자동 매매/자동 주문/원장 자동 수정 금지
  - 체크리스트가 1차 필터, PB/페르소나는 2차 검토자
  - blocking 규칙과 score 규칙을 분리해 표시
- 실사용 보강:
  - principle에 구조 필드(`rule_key`, `target_metric`, `operator`, `threshold_value`, `applies_when_json`) 저장
  - 규칙 실행은 코드에서 `comparisonOperator` alias로 해석해 구조 평가 우선 적용
  - check method 확장(`blocking_boolean`, `threshold_numeric`, `portfolio_exposure` 등)
  - journal 입력에 `entry_type`/`exit_type`/`conviction_level` 추가
  - `strategy_horizon × entry/exit_type` 조합은 차단/경고로 검증
  - check result는 `evidence_json`으로 구조 근거를 저장
  - review는 snapshot(`entry_snapshot_json`, `evaluation_snapshot_json`) 저장
  - analytics는 5개 KPI(평균 충족률, blocking 비율, buy/sell 차이, 위반 원칙 Top5, reflection 실패 패턴 Top5) 우선 노출 + sell 품질 지표(details)
- API:
  - `GET/POST /api/investment-principles`
  - `PATCH /api/investment-principles/:id`
  - `POST /api/trade-journal/check`
  - `GET/POST /api/trade-journal`
  - `GET /api/trade-journal/:id`
  - `POST /api/trade-journal/review`
  - `POST /api/trade-journal/reflection`
  - `GET /api/trade-journal/analytics`

## 개인 콘솔 상태/요약 API

- `GET /api/system/status`
  - env 존재 여부 + 핵심 DB 테이블 접근 진단
  - secret 값은 노출하지 않고 상태만 반환
- `GET /api/dashboard/overview`
  - 홈 대시보드 집계(포트폴리오/루틴/Trend 기억/신호 연결/배지)
- `GET /api/portfolio/summary`
  - 개인 콘솔형 포트폴리오 요약 계약
  - quote provider 우선순위: Google Sheets `GOOGLEFINANCE` read-back -> Yahoo fallback -> none
  - quote 실패는 손실로 해석하지 않고 평가손익을 NO_DATA로 반환
  - 비중은 시세 실패 시 매입금액 기준 fallback
- `POST /api/portfolio/quotes/refresh`
  - quote 시트 row/formula 동기화 요청 (계산 지연 가능)
  - 응답 `nextRecommendedPollSeconds`를 참고해 30~90초 뒤 재조회
- `GET /api/portfolio/quotes/status`
  - 시트 read-back 상태/지연 상태 확인
  - 종목별 진단(`googleTicker`, `rawPrice`, `parsedPrice`, `rowStatus`, `message`)
- `GET /api/portfolio/holdings`
  - 보유/관심 목록 조회
- `PATCH|DELETE /api/portfolio/holdings/[id]`
  - 보유 종목 빠른 수정/삭제 (`google_ticker`, `quote_symbol` 포함)
- `POST /api/portfolio/holdings/apply-trade`
  - buy/sell/correct 사후 반영(외부 체결 주문 기록 반영)
  - sell 반영 시 실현손익(손실 포함) 자동 기록 + 선택 목표 배분

운영 메모:

- KR 종목에서 `GOOGLEFINANCE` 값이 비면 ticker 형식 이슈일 수 있다.
- ticker 우선순위:
  - Google Sheets: `google_ticker` -> `quote_symbol` -> 자동 후보
  - Yahoo fallback: `quote_symbol` -> 자동 후보
- `/portfolio`의 시세 상태 확인 테이블에서 mismatch 종목 ticker를 바로 수정할 수 있다.
- `GET /api/realized-pnl/summary`
  - 기간별 실현손익, 종목별 요약, 목표 배분/미배분 집계
- `GET|POST /api/realized-pnl/events`
  - 실현손익 이벤트 조회/등록
- `PATCH|DELETE /api/realized-pnl/events/[id]`
  - 실현손익 이벤트 수정/삭제
- `GET|POST /api/financial-goals`
  - 목표 조회/생성
- `PATCH|DELETE /api/financial-goals/[id]`
  - 목표 수정/삭제
- `POST /api/financial-goals/[id]/allocations`
  - 목표 배분 생성
- `DELETE /api/financial-goals/allocations/[id]`
  - 목표 배분 취소

### Committee 안정화 보강

- Drucker 응답의 메타 지시문(`[형식 안내]`, `출력 형식` 등) 서버 후처리 제거
- 조일현 보고서는 행동 지침형 섹션 whitelist로 단순화(비허용 섹션/표/버킷 표현 제거)
- followup extractor 파싱 안정화(`strict -> repair -> heuristic fallback`) 및 warning code 구조화
- parse 실패 계열 warning은 내부 코드 유지 + UI 자연어 변환:
  - `extractor_json_parse_failed` -> 자동 복구 시도 안내
  - `repair_succeeded` -> 형식 자동 복구 안내
  - `fallback_used` -> 요약 기반 재생성 안내
- followup warning은 UI에서 사용자 친화 문구로 매핑해 노출(원시 warning code는 디버그에서만 확인)
- warning별 `recommendedAction`을 함께 노출해 사용자가 다음 수정 행동을 바로 알 수 있게 함
- `recommendedAction`은 draft 필드를 함께 보고 item-aware로 가이드를 생성
- `fallback_used`는 `자동 복구 초안` 배지 + 저장 전 점검 confirm 제공(저장은 허용)
- fallback draft는 최소 저장 가능 기준(title/rationale/acceptanceCriteria/entities)을 강제 보강해 빈 목록 반환을 방지
- 조일현 sanitizer는 제거 이력 메타(removed section/table count 등)를 debug에서 확인 가능
- followup/jo report 결과 상단에 품질 strip(정상/복구/강한 정제 등) 노출

### Infographic 2차 UX 보강

- source text 추출과 spec 생성을 분리:
  - `POST /api/infographic/extract-source-text`
  - `POST /api/infographic/extract`
- URL/PDF는 `원문 추출 -> 미리보기/수정 -> 구조화 요약 생성` 2단계 UX
- `sourceMeta` 표시 강화: `sourceTitle`, `extractedTextLength`, `extractionWarnings`
- 기본 렌더 모드:
  - 모바일: `responsive`(읽기)
  - 데스크톱: `export`(저장 미리보기)
- PNG 저장은 항상 `export` 레이아웃 기준

### Infographic 3차 품질 보강

- source extract 파이프라인에 cleanup 단계 추가:
  - 반복 머리글/바닥글 후보 제거
  - 페이지 번호/캡션/copyright
  - 짧은 노이즈 줄 정리
  - 끊긴 문단 일부 병합
- `extract-source-text` 응답에 raw/cleaned 길이 및 cleanup 메타 포함
- 기본 preview는 cleaned text, raw text는 접기 debug 패널로 분리
- 모바일에서 export는 기본 inline 렌더하지 않고 `저장용 미리보기` 액션으로 확인

### Infographic 4차 신뢰도 보강

- cleanup summary strip(경미/중간/강한 정리 적용) 추가
- cleanupSeverity가 높으면 사용자 검토 안내 문구 표시
- 모바일 저장용 미리보기에서 저장 직전 확인(confirm) + 렌더 준비 상태 표시
- 모바일 reader-first 정책 고정:
  - 기본 진입은 responsive 읽기 뷰
  - export inline 기본 렌더 금지
  - `저장용 미리보기`/`PNG 저장` 버튼으로만 저장 레이아웃 접근

### Infographic Extractor Hardening (spec 생성 안정화)

- 본문 추출 성공 후 spec 생성 실패를 줄이기 위해 extractor를 3단계로 보강:
  - 1차: LLM direct 추출
  - 2차: compact 재추출(긴 본문 압축)
  - 3차: semantic fallback(zone/risk/numeric salvage)
- JSON parse는 `strict -> repair(smart quote, trailing comma, backslash, tail cut) -> fallback` 순서
- 서비스/보안형 산업을 위해 domain-aware zone mapping 힌트(`industryPattern`)를 도입
- numeric salvage(`%`, 순위, 라벨:수치)로 bar/pie/comparisons를 규칙 기반 복구
- 품질 메타(`extractionMode`, `parseStage`, `specCompletenessScore`, `filledZoneCount`, `numericEvidenceCount`)를 `sourceMeta`에 기록
- 최소 성공 기준 미달 시 `degraded_fallback`로 분류하고 빈 spec 렌더를 강행하지 않고 편집 단계 재시도를 안내

### Infographic Article-aware 확장

- 문서 성격 classifier(`articlePattern`) 추가:
  - `industry_report`, `company_report`, `opinion_editorial`, `market_commentary`, `thematic_analysis`, `how_to_explainer`, `mixed_or_unknown`
- articlePattern에 따라 zone alias/해석을 분기:
  - 리포트형: 가치사슬 중심
  - 의견/시황형: `문제의식 -> 주장 -> 쟁점 -> 시사점` 프레임
- opinion/commentary는 opinion frame(thesis/support/counter/checkpoint) 우선 추출 후 4-zone 매핑
- source cleanup에 의견형 노이즈(자기수사/과장 기호/광고성 문구) 중립화 규칙 추가
- sourceMeta에 `articlePattern`, `sourceTone`, `subjectivityLevel`, `structureDensity`, claim/signal/risk count를 기록

### Infographic 최종 사용 마감 UX

- 자동 분류는 기본 유지 + 사용자 override 제공:
  - `articlePattern` / `industryPattern` 수동 지정
  - reset to auto 지원
- 결과 유형(`resultMode`) 표시:
  - `industry_structure`, `opinion_argument_map`, `market_checkpoint_map`, `howto_process_map`, `mixed_summary_map`
- degraded fallback은 reason classifier 기반 행동 가이드 제공:
  - `insufficient_structure`, `mixed_document`, `too_long_and_diffuse`, `weak_numeric_support`, `weak_zone_signal`, `opinion_structure_unclear`
- 회귀 fixture 6종(반도체/보안/기관 인사이트/의견형/시황형/혼합형)으로 입력 유형별 안정성 점검

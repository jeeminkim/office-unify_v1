# 트렌드 분석 센터 (Trend Analysis Center)

`/trend` 전용 기능입니다. 일반 페르소나 채팅 레지스트리·`routePolicy`의 legacy `trend_*` 토픽과 **별도**이며, API는 `POST /api/trend/generate` 로 고정합니다.

## 목적

- AGI 시대에 강화되는 **인간적 욕구**와 **돈의 흐름**을 중심으로 미디어·엔터·스포츠·경험·팬덤·IP를 분석합니다.
- 뉴스 나열이 아니라 **직접·간접·인프라 수혜**, 반복 소비·가격 결정력·수익화 구조를 드러냅니다.
- Walt Disney / Hindenburg / Jim Simons 스타일은 **시스템 프롬프트 렌즈**로만 쓰이며, 캐릭터 채팅이 아닙니다.

## 사용자 흐름

1. `SHOW_TREND_UI`가 켜져 있으면 툴바·홈에서 `/trend` 로 진입합니다.
2. 허용된 Google 계정으로 로그인합니다 (`research-center`와 동일 게이트).
3. 기간·모드·지역·섹터·출력 포커스·(선택) 사용자 입력·포트폴리오 맥락·**리서치 엔진(OpenAI/Gemini)·최신 웹·데이터 분석·파일 id**·Sheets append를 설정하고 **리포트 생성**을 누릅니다.
4. 응답은 카드형 UI로 요약·수혜·가설·리스크·추적·출처·**구조화 링크·도구 요약**을 보여 주고, 마크다운 전체를 복사할 수 있습니다.

## 입력·출력 계약

- 타입: `packages/shared-types/src/trendAnalysis.ts` 의 `TrendAnalysisGenerateRequestBody` / `TrendAnalysisGenerateResponseBody`.
- 인증: `requirePersonaChatAuth` + 서비스 롤 Supabase (`getServiceSupabase`).
- **최종 보고서 포맷:** `GEMINI_API_KEY` + `generateGeminiResearchReport` (기본 `gemini-2.5-flash`).
- **리서치(최신성) 보강:** `OPENAI_API_KEY` + OpenAI **Responses API** `POST /v1/responses` with built-in **`web_search`** 및/또는 **`code_interpreter`**. 별도 스크래퍼/RSS는 두지 않습니다.

### OpenAI Responses 요청 (공식 문서 기준)

구현은 [Responses API — Create](https://platform.openai.com/docs/api-reference/responses/create)와 [Web search](https://platform.openai.com/docs/guides/tools-web-search) / [Code Interpreter](https://platform.openai.com/docs/guides/tools-code-interpreter) 가이드의 **필드명**을 따른다.

| 항목 | 값 |
|------|-----|
| `tools` | `{ "type": "web_search" }` |
| `tools` (데이터 분석) | `{ "type": "code_interpreter", "container": { "type": "auto", "memory_limit": "4g", "file_ids": ["file-…"] } }` |
| `include` | `ResponseIncludable` 중 **`web_search_call.action.sources`**, **`code_interpreter_call.outputs`** 만 사용 (`trendOpenAiResponsesConstants.ts`) |
| 재시도 | **`include` 관련 클라이언트(4xx) 오류**일 때만 동일 바디에서 `include` 제거 후 1회 재시도 |
| 다운그레이드 | **code interpreter / container** 로 보이는 4xx이면 `web_search`만 있는 도구로 1회 재시도, 그래도 실패하면 엔진에서 Gemini 폴백 |

### 요청 필드 (추가)

| 필드 | 설명 |
|------|------|
| `provider` | `auto` \| `openai` \| `gemini` — 자동 라우팅·OpenAI 도구 우선·Gemini만 |
| `useWebSearch` | `true`면 웹 검색 도구 후보 포함 |
| `useDataAnalysis` | `true`이고 `attachedFileIds`가 있으면 code interpreter |
| `preferFreshness` | 최신성 우선(자동으로 웹 검색 후보 강화) |
| `attachedFileIds` | OpenAI Files API `file-...` id 배열 |
| `includeMemoryContext` | 기본 `true` — 생략 시 `true`. `false`면 기존 `trend_memory_*` 읽기·delta 비교 생략(쓰기만 하는 모드는 엔진 규칙 참고). |
| `saveToSqlMemory` | 기본 `true` — 생략 시 `true`. `false`면 실행 이력·토픽·시그널 **저장 안 함**(delta 읽기만 가능). |

### 응답 필드 (추가)

| 필드 | 설명 |
|------|------|
| `citations` | 제목·URL·스니펫·구조화 출처 |
| `toolUsage` | 웹 검색·데이터 분석 도구 사용 여부·파일 수·출처 수 |
| `freshnessMeta` | 지역·기간·신선도 설명·OpenAI 리서치 적용 여부 |
| `meta` | `providerUsed`, `webSearchUsed`, `dataAnalysisUsed`, `fallbackUsed`, `researchLayer`, `openAiModel` 및 **memory** 필드(아래) |
| `memoryDelta` | `new` / `reinforced` / `weakened` / `dormant` — 각각 `memoryKey`, `title`, `summary`, `reason` |

### meta.memory (Phase 4)

| 필드 | 설명 |
|------|------|
| `memoryEnabled` | `trend_report_runs` 테이블이 없으면 `false` |
| `memoryReadSucceeded` | 최근 실행·토픽 읽기 성공 여부 |
| `memoryWriteSucceeded` | 실행 이력·토픽·시그널 쓰기 성공 여부 |
| `memoryItemsRead` | 읽은 행 수(실행·토픽 합) |
| `memoryItemsWritten` | 기록한 행·시그널 등 대략치 |
| `memoryStatusNote` | 비활성/실패 시 짧은 이유 |

## 왜 별도 스크래핑 대신 OpenAI built-in tools인가

- **운영 부담·보안:** 자체 크롤러·RSS·브라우저 자동화는 유지 비용과 정책 리스크가 큽니다.
- **GPT Builder/ChatGPT와 유사한 UX:** 모델이 필요할 때만 **hosted web search**와 **code interpreter**를 호출합니다.
- **추가 레이어:** 내부 source pack은 **원칙·포트폴리오·도구 라우팅 힌트**로 유지하고, “최신 사실”은 OpenAI 도구 결과로 보강합니다.

## web search / data analysis 사용 기준

- **웹 검색:** `useWebSearch`·`preferFreshness`·`focus=hot_now`·프롬프트 키워드(예: 최근, 요즘, 지난 7·30·90일, 지금 뜨는, 이번 주/달, 최신, latest 등) 또는 `provider=openai`(기본 최소 웹 검색)일 때 자동 포함.
- **데이터 분석:** `useDataAnalysis=true` **이고** `attachedFileIds`가 있을 때만 code interpreter 도구 포함. 파일 없이 분석만 켠 경우 경고 후 생략.
- **도구 미사용:** `provider=gemini` 또는 `auto`에서 위 조건이 없으면 OpenAI 호출 없이 Gemini·내부 팩만 사용.

## Fallback / 신뢰도

- `OPENAI_API_KEY` 없음 → OpenAI 리서치 생략, `warnings`·`meta.fallbackUsed`, Gemini만으로 리포트 생성.
- OpenAI Responses 실패 → 동일하게 Gemini로 계속, `TREND_FALLBACK_TO_GEMINI` 로그.
- 최신성이 중요한데 웹 검색을 쓰지 못한 경우 `guard`가 경고하고 `confidence`를 낮출 수 있습니다.

## Source pack (역할 축소)

- 구현: `packages/ai-office-engine/src/trend-center/trendCenterSourcePack.ts`
- 구성: 사용자 입력, 기간/지역/섹터, 내부 **투자 원칙·제외 기준·문체 원칙** 상수, (선택) 보유·관심 원장 스냅샷, `sourceRefs`, `freshnessMeta`, **`toolRoutingHint`**.
- “최신 사실 수집기”가 아니라 **내부 컨텍스트 + tool 라우팅 힌트**로 유지합니다.

## Gemini·후처리·guard

- JSON 스키마 강제 대신 **고정 섹션 마크다운** + `trendCenterFormatter` 파싱 + `trendCenterGuards` 경고입니다.
- OpenAI 리서치 텍스트는 **Gemini 사용자 프롬프트에 주입**하고, 최종 섹션 구조는 Gemini가 유지합니다.

## Google Sheets (append-only)

- 선택: `appendToSheets: true` 일 때 `trend_requests` / `trend_reports_log` 탭에 한 줄씩 append합니다 (`apps/web/lib/server/trend-sheets.ts`).
- 앱이 탭 생성/헤더 보정을 best-effort로 시도합니다. 다만 운영 안정성을 위해 수동으로 탭/헤더 상태를 주기적으로 확인하는 것을 권장합니다.
- **read-back·GOOGLEFINANCE 재반영은 하지 않습니다.** 실패해도 리포트 본문은 200으로 반환하고 `warnings`·`meta.appendToSheetsSucceeded`에 남깁니다.

## SQL 장기 메모리 (Phase 4, 3테이블 최소안)

**목적:** MVP·OpenAI tool 경로(2~3단계)는 유지하고, **리포트 실행 이력 + 구조적 메모리 토픽 + 시그널**만 Supabase에 쌓아 “반복 추적 가능한 리서치”로 확장한다. `trend_memory_links` / `trend_followup_queue` 등은 **이번 단계에서 제외**한다.

**왜 3테이블인가:** 전체 5테이블 설계보다 먼저 **실행 이력(`trend_report_runs`)·토픽(`trend_memory_topics`)·시그널(`trend_memory_signals`)** 만으로 delta·감사·재현성을 확보하고, 실패 시에도 본문 생성이 깨지지 않게 한다.

**MVP / OpenAI 단계와의 차이:** 최신성·도구·Gemini 합성은 기존과 동일. **추가**로는 (1) 포맷된 섹션에서 구조적 후보를 추출하고, (2) 기존 토픽과 비교해 `memoryDelta`를 만들고, (3) 선택적으로 DB에 저장한다. **별도 LLM 호출 없음.**

**memory delta 정의 (최소):**

- **new:** 이번 후보에 있고, 기존 `memory_key`와 매칭되지 않음.
- **reinforced:** 같은 `memory_key`로 이미 토픽이 있고 이번에도 후보 등장.
- **weakened:** 활성 토픽인데 이번 후보에 없고, `last_seen`이 오래되지 않음(대략 90일 이내 기준).
- **dormant:** 활성 토픽인데 이번 후보에 없고, 더 오래됨.

**Graceful degradation:** `trend_report_runs` 조회 실패(테이블 없음) 시 `memoryEnabled=false`, `warnings`에 안내. **리포트·HTTP 200은 유지.** 쓰기 실패 시 `memoryWriteSucceeded=false`, 읽기 실패 시 delta 비우거나 읽기만 실패로 표시.

**엔진:** `trendCenterMemory.ts`(DB), `trendMemoryCandidates.ts`·`trendMemoryKey.ts`(후보·키), orchestrator에서 OpenAI/Gemini 경로 **이후**에만 실행해 실패를 국소화.

## Finalizer / 오류 차단 / ops

- Gemini finalizer는 timeout + 1회 retry 후 fallback 경로를 가진다.
- fallback 시 `qualityMeta.finalizer`에 `degraded`/`fallbackUsed`/`retryCount`를 기록한다.
- raw 오류 본문은 UI sanitizer로 차단해 사용자 화면에 원문 오류가 직접 노출되지 않게 한다.
- finalizer degraded 실행은 `trend_memory_signals_v2` upsert를 건너뛰어 오염을 줄인다.
- Trend ops는 `web_ops_events`를 사용하며, read-only 조회와 사용자 write action을 분리해 기록한다.

**DDL:** `docs/sql/append_web_trend_memory_phase1.sql` — 적용 전에도 앱은 빌드·실행된다.

**상세 스키마:** `docs/DATABASE_SCHEMA.md`.

## 수동 API 예시

```http
POST /api/trend/generate
Content-Type: application/json

{
  "mode": "weekly",
  "horizon": "30d",
  "geo": "KR",
  "sectorFocus": ["entertainment", "fandom"],
  "focus": "beneficiaries",
  "includePortfolioContext": false,
  "userPrompt": "라이브 투어 마진과 굿즈 믹스에 질문",
  "provider": "auto",
  "useWebSearch": true,
  "preferFreshness": true
}
```

## Phase 5 후보

- GOOGLEFINANCE **read-back** (시트·원장 재반영)
- 외부 source 품질 보강
- **follow-up queue** / `trend_memory_links`
- 월간 롤업·비교 고도화
- Files API 업로드 → `file_id` UX

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
- **리서치(최신성) 보강:** `OPENAI_API_KEY` + OpenAI **Responses API** `POST /v1/responses` with built-in **`web_search`** 및/또는 **`code_interpreter`** (컨테이너 `file_ids`). 별도 스크래퍼/RSS는 두지 않습니다.

### 요청 필드 (추가)

| 필드 | 설명 |
|------|------|
| `provider` | `auto` \| `openai` \| `gemini` — 자동 라우팅·OpenAI 도구 우선·Gemini만 |
| `useWebSearch` | `true`면 웹 검색 도구 후보 포함 |
| `useDataAnalysis` | `true`이고 `attachedFileIds`가 있으면 code interpreter |
| `preferFreshness` | 최신성 우선(자동으로 웹 검색 후보 강화) |
| `attachedFileIds` | OpenAI Files API `file-...` id 배열 |

### 응답 필드 (추가)

| 필드 | 설명 |
|------|------|
| `citations` | 제목·URL·스니펫·구조화 출처 |
| `toolUsage` | 웹 검색·데이터 분석 도구 사용 여부·파일 수·출처 수 |
| `freshnessMeta` | 지역·기간·신선도 설명·OpenAI 리서치 적용 여부 |
| `meta` | `providerUsed`, `webSearchUsed`, `dataAnalysisUsed`, `fallbackUsed`, `researchLayer`, `openAiModel` 등 |

## 왜 별도 스크래핑 대신 OpenAI built-in tools인가

- **운영 부담·보안:** 자체 크롤러·RSS·브라우저 자동화는 유지 비용과 정책 리스크가 큽니다.
- **GPT Builder/ChatGPT와 유사한 UX:** 모델이 필요할 때만 **hosted web search**와 **code interpreter**를 호출합니다.
- **추가 레이어:** 내부 source pack은 **원칙·포트폴리오·도구 라우팅 힌트**로 유지하고, “최신 사실”은 OpenAI 도구 결과로 보강합니다.

## web search / data analysis 사용 기준

- **웹 검색:** `useWebSearch`·`preferFreshness`·`focus=hot_now`·프롬프트 키워드(최근·요즘·latest 등) 또는 `provider=openai`(기본 최소 웹 검색)일 때 자동 포함.
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
- 스프레드시트에 위 이름의 탭을 만들고, 첫 행에 `TREND_REQUESTS_HEADER` / `TREND_REPORTS_LOG_HEADER` 컬럼(엔진 `trendSheetsRows.ts` 참고)을 맞춰야 append가 의미 있게 쌓입니다.
- **read-back·GOOGLEFINANCE 재반영은 하지 않습니다.** 실패해도 리포트 본문은 200으로 반환하고 `warnings`·`meta.appendToSheetsSucceeded`에 남깁니다.

## SQL / 장기 메모리

- **이번 단계에서도 신규 SQL 파일을 추가하지 않습니다.** (SQL memory는 다음 단계 후보)
- `meta.futureMemoryHint` 등으로 Phase 3에서 Supabase 기억·delta를 붙일 여지만 둡니다. `docs/sql/append_web_trend_*.sql` 는 아직 만들지 않습니다.

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

## 다음 단계 후보

- SQL memory / 월간 롤업 / GOOGLEFINANCE read-back / follow-up 큐 / 파일 업로드 UX 고도화.

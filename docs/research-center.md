# Research Center

단일 종목 심층 리포트 생성 모듈입니다. **투자위원회(포트폴리오 전체)**·**조일현 원장 반영**·**portfolio ledger**와 역할이 분리되어 있습니다.

- Today Candidates의 관찰 후보를 단일 종목 단위로 심화 분석할 때 연결 가능한 경로입니다.
- Committee는 포트폴리오/토론 중심, Research Center는 단일 종목 리포트 중심입니다.

- **Supabase**: 원장 기준 사실(보유/관심, 단가 등).
- **Gemini**: 데스크별 리포트 + Chief Editor 종합.
- **Google Sheets** (선택): `research_requests`, `research_context_cache`, `research_reports_log` 탭에 요약 append. 전체 본문은 저장하지 않습니다.

## 품질/운영 원칙

- `outputQuality`/`modelUsage`/`fallback` 배지를 통해 결과 상태를 표시합니다.
- Sheets append 실패 시에도 본문 생성은 유지하고, 실패는 warnings/ops로만 남깁니다.
- 리포트 전체 본문은 Sheets에 저장하지 않고 요약만 append합니다.

## API

- `POST /api/research-center/generate` — 본문은 `ResearchCenterGenerateRequestBody` / `ResearchCenterGenerateResponseBody` (`@office-unify/shared-types`).

## UI

- 경로: `/research-center`

## 시트 준비

탭 이름은 `research_requests`, `research_context_cache`, `research_reports_log` — **1행은 아래 순서·개수와 정확히 일치**해야 합니다(append는 열 위치 기준). 표기만 비슷하고 열이 짧으면 값이 밀립니다.

### `research_requests` — **A1:N1** (14열)

`requested_at` | `market` | `symbol` | `name` | `sector` | `selected_desks` | `tone_mode` | `user_hypothesis` | `known_risk` | `holding_period` | `key_question` | `include_sheet_context` | `status` | `note`

### `research_context_cache` — **A1:N1** (14열)

`market` | `symbol` | `name` | `is_holding` | `is_watchlist` | `avg_price` | `target_price` | `holding_weight_pct` | `watchlist_priority` | `investment_memo` | `interest_reason` | `observation_points` | `committee_summary_hint` | `last_synced_at`

### `research_reports_log` — **A1:M1** (13열)

`generated_at` | `market` | `symbol` | `name` | `selected_desks` | `strongest_long_case` | `strongest_short_case` | `editor_verdict` | `missing_evidence` | `next_check` | `tone_mode` | `status` | `report_ref`

코드 상수: `packages/ai-office-engine/src/research-center/researchSheetsRows.ts` 의 `RESEARCH_*_HEADER`.

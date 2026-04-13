# Changelog

## Unreleased

- **Trend Analysis Center (MVP):** `/trend` 생성형 스튜디오, `POST /api/trend/generate`, `ai-office-engine/trend-center` (source pack, prompts, formatter, guards, orchestrator), shared-types 계약, 선택 Google Sheets append-only 로그. SQL 스키마 추가 없음.
- **Trend Analysis Center (Phase 3):** OpenAI Responses API의 **web_search**·**code_interpreter**로 리서치 레이어 추가 후 Gemini로 최종 보고서 합성. `provider` / `useWebSearch` / `useDataAnalysis` / `preferFreshness` / `attachedFileIds`, 응답 `citations`·`toolUsage`·`freshnessMeta`·확장 `meta`. 별도 스크래퍼 없음. SQL 추가 없음.
- **Trend / OpenAI:** 공식 API `include` 문자열만 사용, `include` 관련 4xx 시에만 `include` 제거 재시도, code interpreter 오류 시 web_search 단일 도구로 다운그레이드. 최신성 키워드(지난 7·30·90일 등) 라우팅 보강.
- **Trend Analysis Center (Phase 4 — SQL memory 1차):** 3테이블 최소안(`trend_report_runs`, `trend_memory_topics`, `trend_memory_signals`). 요청 `includeMemoryContext` / `saveToSqlMemory`, 응답 `memoryDelta` + `meta.memory*`. 포맷터 출력 기반 후보 추출·delta(별도 LLM 없음). 테이블 미적용 시 본문은 성공·memory만 생략. DDL: `docs/sql/append_web_trend_memory_phase1.sql`. 문서: `docs/DATABASE_SCHEMA.md`, `docs/trend-analysis-center.md`.

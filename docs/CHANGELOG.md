# Changelog

## Unreleased

- **Trend Analysis Center (MVP):** `/trend` 생성형 스튜디오, `POST /api/trend/generate`, `ai-office-engine/trend-center` (source pack, prompts, formatter, guards, orchestrator), shared-types 계약, 선택 Google Sheets append-only 로그. SQL 스키마 추가 없음.
- **Trend Analysis Center (Phase 3):** OpenAI Responses API의 **web_search**·**code_interpreter**로 리서치 레이어 추가 후 Gemini로 최종 보고서 합성. `provider` / `useWebSearch` / `useDataAnalysis` / `preferFreshness` / `attachedFileIds`, 응답 `citations`·`toolUsage`·`freshnessMeta`·확장 `meta`. 별도 스크래퍼 없음. SQL 추가 없음.

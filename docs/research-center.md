# Research Center

단일 종목 심층 리포트 생성 모듈입니다. **투자위원회(포트폴리오 전체)**·**조일현 원장 반영**·**portfolio ledger**와 역할이 분리되어 있습니다.

- **Supabase**: 원장 기준 사실(보유/관심, 단가 등).
- **Gemini**: 데스크별 리포트 + Chief Editor 종합.
- **Google Sheets** (선택): `research_requests`, `research_context_cache`, `research_reports_log` 탭에 요약 append. 전체 본문은 저장하지 않습니다.

## API

- `POST /api/research-center/generate` — 본문은 `ResearchCenterGenerateRequestBody` / `ResearchCenterGenerateResponseBody` (`@office-unify/shared-types`).

## UI

- 경로: `/research-center`

## 시트 준비

스프레드시트에 아래 이름의 탭을 만들고, 각 탭 1행에 `packages/ai-office-engine`의 `RESEARCH_*_HEADER` 컬럼과 맞는 헤더를 두세요. `SHEET_TAB_NAMES`는 `research_requests`, `research_context_cache`, `research_reports_log`입니다.

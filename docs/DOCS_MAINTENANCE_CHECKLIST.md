# Docs Maintenance Checklist

## 새 API 추가 시

- `docs/SYSTEM_ARCHITECTURE.md`
- 해당 기능 문서(예: `trend-analysis-center.md`, `research-center.md`)
- 필요 시 `docs/CURRENT_SYSTEM_BASELINE.md`

## 새 SQL 추가 시

- `docs/DATABASE_SCHEMA.md`
- `docs/ops/sql-application-status.md`
- 관련 ops 문서(예: today/sector/trend)

## 새 ops code 추가 시

- `docs/ops/web_ops_events_upsert_rpc.md`
- 기능별 ops 문서(`docs/ops/today_candidates.md`, `docs/ops/sector_radar_score_quality.md`, `docs/ops/trend_ops_logging.md`)
- `docs/CHANGELOG.md`

## 새 UI route 추가 시

- `docs/SYSTEM_ARCHITECTURE.md`의 메인 화면 구조/서버 API 계층
- 필요 시 `docs/CURRENT_SYSTEM_BASELINE.md`

## 새 qualityMeta 필드 추가 시

- 기능 문서 + ops 문서에 동시 반영
- `qualityMeta`(화면 상태) vs `web_ops_events`(운영 누적) 분리 원칙 확인

## 공통 표현 점검

- 자동 매매/자동 주문/확정 수익률 표현 금지
- "추천 종목"보다 "관찰 후보", "관찰 우선순위", "판단 보조" 우선
- secret/token/API key 실값 문서 기재 금지

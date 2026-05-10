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
- read-only: `qualityMeta` 유지 + 개별 warning DB write 억제 + aggregate는 **화이트리스트 eventCode + isCritical + cooldown + budget + fingerprint**만
- `isCritical`은 read-only 통과권이 아님(허용 코드와 함께만)
- Ops aggregate `detail` 스키마·코드 상수 변경 시 `opsAggregateWarnings.ts`·본 체크리스트·`CHANGELOG`·관련 ops 문서 동시 갱신
- 문서 스모크: `apps/web/lib/docs/systemArchitectureDoc.smoke.test.ts` — `SYSTEM_ARCHITECTURE.md` H1·`### Dashboard Today Candidates` 위치 검증
- ETF 테마 카탈로그/게이트 변경 시 `docs/ops/sector_radar_score_quality.md`, `docs/ops/today_candidates.md`, `docs/CURRENT_SYSTEM_BASELINE.md`, `docs/SYSTEM_ARCHITECTURE.md`, `docs/CHANGELOG.md`를 함께 갱신
- ETF 품질 경고 문서화 시 `qualityMeta`(화면)와 `web_ops_events`(운영 누적) 분리, read-only 개별 write 억제 원칙을 명시
- ETF 표시 그룹(`scored`/`watch_only`/`excluded`) 또는 `quoteAlias`/진단 필드(`etfQualityDiagnostics`) 계약 변경 시 API additive 원칙(기존 필드 유지)을 문서에 명시
- diagnostics snapshot 정책 문서화 시 read-only route DB write 금지, explicit refresh/admin/scheduled 전용 저장 원칙을 함께 명시
- Research Center 오류 계약 변경 시 `docs/research-center.md`, `docs/ops/research_center.md`, `docs/ops/research_center_smoke_test.md`(배포 검증), `SYSTEM_ARCHITECTURE`, `CURRENT_SYSTEM_BASELINE`, `CHANGELOG`를 함께 갱신
- `requestId`/`failedStage`/`qualityMeta.researchCenter` 추가 시 기존 응답 필드 삭제 금지(additive only) 원칙을 문서에 명시

# 데이터베이스 스키마 (웹 앱 요약)

웹 앱이 Supabase(Postgres)에 기대는 **문서화된 DDL 조각**과의 대응 관계를 정리한다. 전체 레거시(Discord 등) 스키마는 이 저장소 범위를 넘을 수 있다.

## Trend Analysis Center — Phase 4 SQL memory

**파일:** `docs/sql/append_web_trend_memory_phase1.sql`

| 테이블 | 역할 |
|--------|------|
| `trend_report_runs` | 리포트 생성 1회당 1행(실행 이력). 본문·메타·도구·freshness 스냅샷. |
| `trend_memory_topics` | 사용자별 `memory_key`로 유일한 **구조적 테마** (전문 저장 아님). |
| `trend_memory_signals` | 토픽별 시그널( delta_new / reinforced / weakened / dormant 등). |

**인덱스:** `user_key` + 시간/상태 조회 위주 (`append_web_trend_memory_phase1.sql` 참고).

**제외(Phase 4):** `trend_memory_links`, `trend_followup_queue` — 후속 단계 후보.

## 기타 웹 DDL (참고)

| 문서 | 내용 |
|------|------|
| `docs/sql/append_web_persona_chat_phase1.sql` | 페르소나 채팅 |
| `docs/sql/append_web_persona_memory_optional.sql` | 선택 웹 장기 기억 |
| `docs/sql/append_web_portfolio_ledger.sql` | 포트폴리오 원장 |
| `docs/sql/append_web_llm_usage_monthly.sql` | LLM 사용량 |
| `docs/sql/append_web_committee_followups.sql` | 투자위원회 후속작업(추출 draft 저장) |

## Committee Followups (조일현 보고서 후속작업)

**파일:** `docs/sql/append_web_committee_followups.sql`

| 테이블 | 역할 |
|--------|------|
| `committee_followup_items` | `committee_turn_id`에 연결된 후속작업 본문/상태 |
| `committee_followup_artifacts` | draft JSON 등 원본 아티팩트 |

주요 인덱스:

- `user_key`, `committee_turn_id`, `status`, `created_at desc`
- 운영 조회 최적화: `user_key + status + updated_at desc`, `user_key + committee_turn_id`
- artifact 최신 조회 최적화: `followup_item_id + artifact_type + created_at desc`

핵심 원칙:

- 조일현 Markdown(`report`)은 사람용 문서이며, DB 저장용 후속작업은 별도 JSON 계약으로 분리한다.
- 저장은 사용자 명시 액션(`followups/save`)에서만 수행한다.
- 자동 주문/자동 매매/원장 자동 반영과 무관한 추적 테이블이다.
- `reanalyze` 실행 결과는 artifact를 append-only로 누적 저장한다(`reanalyze_payload`, `reanalyze_result_json`, `reanalyze_result_md`).

## Trade Journal / Investment Principles

**파일:** `docs/sql/append_web_trade_journal.sql`

| 테이블 | 역할 |
|--------|------|
| `investment_principle_sets` | 사용자별 원칙 세트(기본 세트 포함) |
| `investment_principles` | buy/sell/common/risk 체크리스트 규칙 |
| `trade_journal_entries` | 매매일지 본문 |
| `trade_journal_check_results` | 원칙별 점검 결과(met/not_met/unclear/manual_required) |
| `trade_journal_evaluations` | 일지 단위 점검 요약 점수/차단 위반 |
| `trade_journal_reviews` | PB/페르소나 2차 검토 결과 |
| `trade_journal_reflections` | 거래 후 회고 기록 |
| `trade_journal_followups` | 회고/검토 리마인더 일정 |

핵심 원칙:

- 자동 매매/자동 주문/원장 자동 수정은 이 계층의 책임이 아니다.
- 체크리스트 평가가 1차 기준, PB/페르소나 검토는 2차 보조다.
- blocking 규칙은 점수와 별도로 집계한다.
- `investment_principles`는 `rule_text` 외 구조 필드(`rule_key`, `target_metric`, `operator`, `threshold_value`, `threshold_unit`, `applies_when_json`)를 함께 저장한다.
- 코드 레벨에서는 `operator`를 `comparisonOperator`로 alias 해석해 규칙 비교 의도를 명확히 한다.
- `trade_journal_entries`는 `entry_type`/`exit_type`/`conviction_level`로 진입/청산 의도를 구조화한다.
- `trade_journal_reviews`는 `entry_snapshot_json`/`evaluation_snapshot_json`으로 리뷰 시점의 상태를 고정 저장한다.
- `trade_journal_check_results`는 `evidence_json`으로 구조화된 판정 근거를 저장한다.

## 미적용 시 동작 (Trend memory)

DDL을 적용하지 않으면 `trend_report_runs` 조회가 실패하고, 엔진은 **SQL memory만 끄고** 리포트 본문·OpenAI/Gemini 경로는 그대로 둔다. 응답 `meta.memoryEnabled=false`, `warnings`에 안내 문자열.

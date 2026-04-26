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
| `docs/sql/append_web_realized_pnl_and_goals.sql` | 실현손익 이벤트 + 목표 자금 + 목표 배분 |
| `docs/sql/append_web_portfolio_quote_overrides.sql` | 보유 종목 quote ticker 수동 override 컬럼 |
| `docs/sql/append_web_portfolio_watchlist_quote_overrides.sql` | 관심종목 quote ticker 수동 override 컬럼 |

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

## Personal Dashboard runtime dependencies

개인 투자 대시보드 API는 아래 테이블 접근 가능 여부를 상태판에서 진단한다.

- `web_portfolio_holdings`
- `web_persona_chat_requests`
- `trend_memory_topics`
- `trade_journal_entries`

## Portfolio dashboard vs ledger responsibilities

- `/portfolio`는 `web_portfolio_holdings`를 읽어 현황(평가/비중/경고)을 보여주는 점검 화면이다.
- `/portfolio-ledger`는 동일 테이블/`web_portfolio_watchlist`를 수정하는 관리 화면이다.
- `apply-trade`는 실제 주문 실행이 아닌 사후 기록 반영:
  - buy: 수량 증가 + 가중평균 단가 재계산
  - sell: 수량 감소(전량 시 삭제, 옵션으로 watchlist 이동) + 실현손익 이벤트 저장
  - correct: 수량/평단 직접 정정
- `web_portfolio_holdings`의 `google_ticker`/`quote_symbol`은 시세 연동 수동 보정 필드:
  - `google_ticker`: Google Sheets `GOOGLEFINANCE` read-back용 우선 ticker
  - `quote_symbol`: Yahoo fallback 등 일반 quote provider용 우선 심볼
- `web_portfolio_watchlist`에도 동일한 `google_ticker`/`quote_symbol` override를 둘 수 있다(마이그레이션: `docs/sql/append_web_portfolio_watchlist_quote_overrides.sql`).
- **Ticker 추천(자동 저장 없음):** 스프레드시트 탭 `portfolio_quote_candidates`(기본명, `PORTFOLIO_TICKER_CANDIDATES_SHEET_NAME`로 변경 가능)에 후보별 수식을 쌓고, API가 read-back하여 추천 후보를 보여 준다. DB 반영은 사용자가 `POST /api/portfolio/ticker-resolver/apply`로 승인할 때만 수행한다.
- **일괄 승인 저장:** `POST /api/portfolio/ticker-resolver/apply-bulk`는 사용자 명시 승인 시에만 다수 후보를 저장하며, 일부 실패는 `failedItems`로 반환한다.
- **portfolio_quotes 동기화 정책:** `google_ticker`가 있는 보유만 확정 quote row를 작성하고, 누락 심볼은 `missingTickerSymbols`로 반환해 recovery flow로 연결한다. row key는 `normalized_key` 기준으로 read-back/summary를 매칭한다.
- **Gold Insight read model:** 오늘 브리핑/알림/도시어는 기존 테이블(`web_portfolio_holdings`, `trade_journal_*`, `realized_profit_events`, `financial_goals`, `goal_allocations`, `trend_report_runs`, `web_persona_messages`, `web_committee_turns`)을 조합해 계산하며 신규 DB 테이블을 요구하지 않는다(additive).

## Realized PnL + Financial Goals

**파일:** `docs/sql/append_web_realized_pnl_and_goals.sql`

| 테이블 | 역할 |
|--------|------|
| `realized_profit_events` | 매도 확정 손익(손실 포함), 수수료/세금/순실현손익 저장 |
| `financial_goals` | 단기/중기 목표 금액, 배분 누계, 상태 관리 |
| `goal_allocations` | 실현손익/수동현금/조정 기반 목표 배분 이력 |

핵심 원칙:

- 기존 웹 앱 사용자 스코프와 맞추기 위해 `user_id` 대신 `user_key`를 사용한다.
- 실현손익은 외부 체결 후 기록하며, 주문 실행 기능은 없다.
- 목표 배분은 자금 흐름 추적 보조이며 실제 계좌 이체가 아니다.
- 기본 제한: 실현손익 배분액은 해당 이벤트 순실현손익을 초과할 수 없다(수동 현금 배분은 별도 타입).

Quote read-back 운영 메모:

- `portfolio_quotes`(기본 탭명)에는 `GOOGLEFINANCE` 수식이 저장되고 서버는 계산 결과를 read-back 한다.
- `PORTFOLIO_QUOTES_SHEET_NAME` 환경변수로 탭명을 바꿀 수 있다.
- 시세 계산 불가(`NO_DATA`)와 평가금액 0은 다른 의미로 취급한다.

## 미적용 시 동작 (Trend memory)

DDL을 적용하지 않으면 `trend_report_runs` 조회가 실패하고, 엔진은 **SQL memory만 끄고** 리포트 본문·OpenAI/Gemini 경로는 그대로 둔다. 응답 `meta.memoryEnabled=false`, `warnings`에 안내 문자열.

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

## 미적용 시 동작 (Trend memory)

DDL을 적용하지 않으면 `trend_report_runs` 조회가 실패하고, 엔진은 **SQL memory만 끄고** 리포트 본문·OpenAI/Gemini 경로는 그대로 둔다. 응답 `meta.memoryEnabled=false`, `warnings`에 안내 문자열.

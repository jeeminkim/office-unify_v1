# Supabase SQL 적용 순서 (운영)

운영 Supabase에 문서만 있고 스키마가 빠지면 API가 **503**, **`skipped`**, **`table_missing` 코드**, 또는 **저장 실패**로 보일 수 있습니다. 아래는 **추가(additive) 마이그레이션** 위주의 권장 순서입니다. 실제 테이블명·제약은 배포 스키마와 맞춰 조정하세요.

## 원칙

- 기존 마이그레이션 파이프라인이 있으면 그 순서를 우선합니다.
- **UNIQUE INDEX** 추가 전에는 해당 파일의 **사전 점검 SELECT**로 중복 행을 제거합니다.
- `append_web_ops_events_upsert_rpc.sql`는 RPC가 없어도 앱이 폴백할 수 있지만, fingerprint 멱등 로깅을 쓰려면 적용하는 것이 좋습니다.

---

## 1. 코어 앱·포트폴리오·채팅 기반

| 순서 | 파일 | 목적 | 미적용 시 증상(예) |
|-----:|------|------|---------------------|
| 1 | `append_web_persona_chat_phase1.sql` | 페르소나 채팅 기본 테이블 | 초기 채팅·세션 관련 기능 제한 |
| 2 | `append_web_persona_chat_requests.sql` | 요청 로그 | 디버깅·추적 제한 |
| 3 | `append_web_persona_chat_idempotency_optional.sql` | 멱등 키(선택) | 중복 생성 가능성 |
| 4 | `append_web_persona_memory_optional.sql` | 메모리 확장(선택) | 확장 메모 기능 없음 |
| 5 | `append_web_portfolio_ledger.sql` | 원장·보유/관심 기본 | **`GET /api/portfolio/holdings` → `portfolio_holdings_table_missing`** 등 |
| 6 | `append_web_portfolio_trade_events.sql` | 매매 이벤트 | 거래 원장 플로우 제한 |
| 7 | `append_web_portfolio_quote_overrides.sql` | 시세 오버라이드 | 시세 보정 옵션 없음 |
| 8 | `append_web_portfolio_watchlist_quote_overrides.sql` | 관심 시세 오버라이드 | 동일 |

---

## 2. 투자자 프로필·적합성(Today Brief)

| 순서 | 파일 | 목적 | 미적용 시 증상(예) |
|-----:|------|------|---------------------|
| 9 | `append_investor_profile.sql` | `web_investor_profiles` | **`GET /api/investor-profile` → 503 `investor_profile_table_missing`** · Today Brief suitability **`skipped`** |

**적용 후 확인:**

```sql
select count(*) from information_schema.tables
 where table_schema = 'public' and table_name = 'web_investor_profiles';
```

---

## 3. Research Center follow-up + 중복 방지 인덱스

| 순서 | 파일 | 목적 | 미적용 시 증상(예) |
|-----:|------|------|---------------------|
| 10 | `append_research_followup_items.sql` | `web_research_followup_items` | **`GET /api/research-center/followups` → `research_followup_table_missing`** · 저장/PB 연계 불가 |
| 11 | `append_research_followup_items_dedupe_index.sql` | 표현식 UNIQUE 인덱스 | 중복 follow-up 방지 실패 |

### ⚠️ 인덱스 전 필수 사전 점검 (`append_research_followup_items_dedupe_index.sql` 내부 주석과 동일)

중복이 있으면 `CREATE UNIQUE INDEX`가 실패합니다. 파일 상단의 `GROUP BY … HAVING count(*) > 1` 쿼리를 실행해 정리한 뒤 인덱스를 적용합니다.

**적용 후 확인:**

```sql
select indexname from pg_indexes
 where tablename = 'web_research_followup_items'
   and indexname = 'web_research_followup_items_user_req_title_sym_uidx';
```

---

## 4. 판단 복기(Decision retrospectives)

| 순서 | 파일 | 목적 | 미적용 시 증상(예) |
|-----:|------|------|---------------------|
| 12 | `append_decision_retrospectives.sql` | `web_decision_retrospectives` | **`GET /api/decision-retrospectives` → 503 `decision_retrospective_table_missing`** |

**적용 후 확인:**

```sql
select count(*) from information_schema.tables
 where table_schema = 'public' and table_name = 'web_decision_retrospectives';
```

---

## 5. 관심종목 섹터 매칭 메타·키워드 매칭

| 순서 | 파일 | 목적 | 미적용 시 증상(예) |
|-----:|------|------|---------------------|
| 13 | `append_watchlist_sector_match.sql` | `sector_match_*` 등 컬럼 | Sector Radar 키워드 매칭 **`preview`/`apply` 부분 실패** 또는 메타 저장 생략 |

---

## 6. 보유 incomplete (NULL qty / avg)

| 순서 | 파일 | 목적 | 미적용 시 증상(예) |
|-----:|------|------|---------------------|
| 14 | `append_portfolio_holdings_incomplete.sql` | NULL 허용·운영 메모 | **`POST /api/portfolio/holdings` incomplete 저장 시 NOT NULL 오류** · **`portfolio_holdings_incomplete_schema_not_ready`** |

> 실제 DB가 이미 NULL 허용이면 DDL 없이 주석만 적용해도 됩니다.

---

## 7. 운영 로그(ops)·RPC

| 순서 | 파일 | 목적 | 미적용 시 증상(예) |
|-----:|------|------|---------------------|
| 15 | `append_web_ops_events.sql` | `web_ops_events` | 운영 로그·timeout 진단 누락 |
| 16 | `append_web_ops_events_upsert_rpc.sql` | fingerprint upsert RPC | 멱등 upsert 실패 시 로깅 폴백(앱은 동작 가능) |

---

## 8. Today Candidates · Sector Radar · Research · 관심 등록 후보 (통합 보강)

| 순서 | 파일 | 목적 | 미적용 시 증상(예) |
|-----:|------|------|---------------------|
| 17 | `append_today_candidate_impressions.sql` | 후보 노출 이력 | 7일 관심종목 반복·미국 후보 absent 진단 DB 불가 |
| 18 | `append_sector_radar_snapshots.sql` | Sector Radar run/item 스냅샷 | 스냅샷 기반 Today 연계·최근 run 조회 불가 |
| 19 | `append_research_report_history.sql` | 리포트 이력·diff | 동일 종목 리포트 재사용·7일 diff 불가 |
| 20 | `append_watchlist_recommendation_candidates.sql` | 관심 등록 후보(pending) | 승인형 관찰 후보 저장 불가 |
| 21 | `append_today_candidate_feedback.sql` | 사용자 피드백(hide_7d·mark_reviewed·keep_observing) | 피드백 저장 불가 · 리스크 점검 후보 사용자 제어 degraded |
| 22 | `append_web_action_items.sql` | 통합 Action Item 인박스 | **`GET/POST /api/action-items` → `action_item_table_missing`** · 7개 출처에서 「액션 인박스에 저장」 불가 |
| 23 | `append_daily_review_notes.sql` | Daily Review 일일 점검 메모 | **`POST /api/daily-review/notes` → table_missing** · 30일 복기 dailyReviewNotes partial · `/daily-review` 메모 저장 불가 |
| 24 | `append_pb_daily_conversations.sql` | PB daily template conversation + 투자 기억 후보 | PB 응답은 계속 보이나 `pbDailyConversation.warning`에 schema missing · Today/Research/Committee/Risk Review 개인화 기억 미연계 |

> `append_web_portfolio_ledger.sql`(관심·보유) 이후 적용 권장. Research follow-up(§3)과 병행 가능.
> 피드백은 **confirm 후 POST**만 저장하며, impressions(노출 이력)와 분리합니다.
> `append_pb_daily_conversations.sql`은 EVO-064 기준으로 GIN index, template/action CHECK, `user_investment_memory(user_key,memory_type,memory_key)` unique index, `updated_at` trigger까지 포함합니다. 기존 환경에 약한 `(user_key,memory_key)` unique가 남아 있으면 별도 감사 후 제거 여부를 판단하세요.

**적용 후 확인:**

```sql
select table_name from information_schema.tables
 where table_schema = 'public'
   and table_name in (
     'today_candidate_impressions',
     'sector_radar_runs',
     'sector_radar_items',
     'research_report_runs',
     'research_report_diffs',
     'watchlist_recommendation_candidates',
     'today_candidate_feedback',
     'web_action_items',
     'web_daily_review_notes',
     'pb_daily_conversations',
     'user_investment_memory'
   )
 order by 1;
```

```sql
-- PB daily conversation schema hardening
select conname from pg_constraint
 where conrelid = 'public.pb_daily_conversations'::regclass
   and conname in (
     'pb_daily_conversations_template_type_check',
     'pb_daily_conversations_action_category_check'
   );

select indexname from pg_indexes
 where schemaname = 'public'
   and tablename in ('pb_daily_conversations', 'user_investment_memory')
   and indexname in (
     'idx_pb_daily_conversations_symbols_gin',
     'idx_pb_daily_conversations_themes_gin',
     'idx_user_investment_memory_unique_type_key',
     'idx_user_investment_memory_user_updated'
   );

select trigger_name from information_schema.triggers
 where event_object_schema = 'public'
   and event_object_table = 'user_investment_memory'
   and trigger_name = 'trg_user_investment_memory_updated_at';
```

```sql
-- daily review notes idempotency · saved subject unique
select indexname from pg_indexes
 where tablename = 'web_daily_review_notes'
   and indexname in ('web_daily_review_notes_idempotency_uidx', 'web_daily_review_notes_saved_subject_uidx');
```

```sql
-- action item status check · dedupe index
select indexname from pg_indexes
 where tablename = 'web_action_items'
   and indexname in ('web_action_items_user_source_title_uidx', 'web_action_items_idempotency_uidx');
```

```sql
-- feedback_action check · idempotency unique
select indexname from pg_indexes
 where tablename = 'today_candidate_feedback'
   and indexname = 'today_candidate_feedback_idempotency_uidx';
```

---

## 9. 기타 문서화된 append 스크립트 (기능별)

아래는 제품 플래그에 따라 필요 시 적용합니다.

| 파일 | 비고 |
|------|------|
| `append_web_committee_turns.sql` / `append_web_committee_followups.sql` | 위원회 토론 |
| `append_web_trade_journal.sql` | 매매 일지 |
| `append_web_decision_journal.sql` | 결정 일지 |
| `append_web_realized_pnl_and_goals.sql` | 실현손익·목표 |
| `append_web_llm_usage_monthly.sql` | 사용량 집계 |
| `append_web_dev_support.sql` | 개발 지원 |
| `append_trend_structured_memory.sql` / `append_web_trend_memory_phase1.sql` | 트렌드 메모리 |
| `append_web_persona_memory_optional.sql` | 이미 상단 선택 |

---

## 앱 스모크

배포 전 API 점검: `npm run pre-live-smoke --workspace=apps/web` (dry-run). 실호출은 `PRE_LIVE_LIVE=1` 및 세션 쿠키 환경변수를 사용합니다. 자세한 변수는 스크립트 헤더 주석을 참고하세요.

---

## 앱 SQL readiness 화면

배포·운영 시 `GET /api/system/sql-readiness` 및 웹 **`/ops/sql-readiness`** 에서 위 순서의 적용 상태를 read-only로 점검할 수 있습니다. SQL은 자동 적용하지 않으며, 누락 항목은 Supabase SQL Editor에서 해당 파일을 수동 적용한 뒤 화면에서 「다시 점검」하세요.

---

## 관련 문서

- `docs/DATABASE_SCHEMA.md`
- `docs/ops/today_candidates.md`
- `docs/ops/sector_radar.md`

**자동매매·자동 주문·자동 리밸런싱·자동 포트폴리오 변경은 이 레포 범위에서 추가하지 않습니다.**

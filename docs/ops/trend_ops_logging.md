# Trend Ops Logging

## Warning Code 목록

- `trend_gemini_finalizer_failed`
- `trend_gemini_finalizer_retry_failed`
- `trend_final_report_fallback_used`
- `trend_raw_error_report_blocked`
- `trend_sheets_requests_append_failed`
- `trend_sheets_requests_range_invalid`
- `trend_sheets_requests_tab_created`
- `trend_sheets_requests_append_fallback_used`
- `trend_time_window_section_missing`
- `trend_source_quality_low`
- `trend_source_quality_parse_failed`
- `trend_ticker_corrected`
- `trend_ticker_ambiguous`
- `trend_memory_structured_json_created`
- `trend_memory_report_run_saved`
- `trend_memory_report_run_save_failed`
- `trend_memory_signal_upsert_success`
- `trend_memory_signal_upsert_partial_failed`
- `trend_memory_signal_upsert_failed`
- `trend_memory_compare_success`
- `trend_memory_compare_failed`
- `trend_quality_postprocess_failed`
- `trend_provider_fallback`
- `trend_web_search_degraded`
- `trend_gemini_format_degraded`
- `trend_ops_summary_unavailable`
- `trend_memory_json_merge_failed`
- `trend_signal_key_normalize_failed`
- `trend_signal_compare_heuristic_used`
- `trend_unknown_warning`

## Severity 기준

- `info`: structured memory 생성 성공, report run 저장 성공, signal upsert 성공
- `warning`: source quality low, ticker corrected/ambiguous, partial upsert 실패, compare 경고
- `error`: quality postprocess 실패, report run 저장 실패, signal upsert 전체 실패

## Fingerprint 규칙

- `trend:${userKey}:${topicKey}:finalizer:gemini_failed`
- `trend:${userKey}:${topicKey}:finalizer:fallback_used`
- `trend:${userKey}:${topicKey}:sheets:trend_requests_range_invalid`
- `trend:${userKey}:${topicKey}:${stage}:${warningCode}`
- `trend:${userKey}:${topicKey}:ticker:${companyName}:${status}`
- `trend:${userKey}:${topicKey}:signal_upsert`
- `trend:${userKey}:${topicKey}:memory_compare`

동일 fingerprint는 신규 insert 대신 `occurrence_count` 증가 + `last_seen_at` 갱신.

`detail`에는 가능한 한 아래만 저장한다(API 키·토큰·원문 입력 전체·credential 제외).

```json
{
  "feature": "trend",
  "stage": "format",
  "provider": "gemini",
  "topicKey": "...",
  "status": "failed",
  "fallbackUsed": true,
  "error": { "name": "...", "message": "..." }
}
```

## 운영 조회 SQL

최근 7일 Trend 운영 요약

```sql
select
  code,
  severity,
  count(*) as event_rows,
  sum(coalesce(occurrence_count, 1)) as occurrence_total,
  max(last_seen_at) as last_seen_at
from public.web_ops_events
where domain = 'trend'
  and last_seen_at >= now() - interval '7 days'
group by code, severity
order by occurrence_total desc, last_seen_at desc;
```

```sql
select
  severity,
  domain,
  code,
  status,
  occurrence_count,
  first_seen_at,
  last_seen_at,
  message,
  detail
from public.web_ops_events
where domain = 'trend'
order by last_seen_at desc
limit 50;
```

Gemini finalizer·Sheets 요청 로그 이슈

```sql
select
  code,
  severity,
  occurrence_count,
  first_seen_at,
  last_seen_at,
  message,
  detail
from public.web_ops_events
where domain = 'trend'
  and code in (
    'trend_gemini_finalizer_failed',
    'trend_gemini_finalizer_retry_failed',
    'trend_final_report_fallback_used',
    'trend_raw_error_report_blocked',
    'trend_sheets_requests_append_failed',
    'trend_sheets_requests_range_invalid'
  )
order by last_seen_at desc
limit 50;
```

최근 티커 이슈

```sql
select
  code,
  severity,
  occurrence_count,
  detail->'tickerItems' as ticker_items,
  last_seen_at
from public.web_ops_events
where domain = 'trend'
  and code in ('trend_ticker_corrected', 'trend_ticker_ambiguous')
order by last_seen_at desc
limit 30;
```

최근 memory upsert 이슈

```sql
select
  code,
  severity,
  occurrence_count,
  detail,
  last_seen_at
from public.web_ops_events
where domain = 'trend'
  and code in (
    'trend_memory_signal_upsert_partial_failed',
    'trend_memory_signal_upsert_failed',
    'trend_memory_compare_failed'
  )
order by last_seen_at desc
limit 30;
```

```sql
select
  code,
  severity,
  occurrence_count,
  first_seen_at,
  last_seen_at,
  detail
from public.web_ops_events
where domain = 'trend'
  and detail->>'topicKey' = 'k-content'
order by occurrence_count desc, last_seen_at desc;
```

반복 신호 Top N

```sql
select
  topic_key,
  signal_key,
  signal_name,
  time_bucket,
  confidence,
  source_grade,
  occurrence_count,
  first_seen_at,
  last_seen_at,
  status
from public.trend_memory_signals_v2
order by last_seen_at desc
limit 50;
```
